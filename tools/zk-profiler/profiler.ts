import fs from "fs";
import path from "path";

/* ---------------- Solana 2026 limits ---------------- */

const SOLANA_TX_MAX_BYTES = 1232;
const SAFE_INSTRUCTION_DATA_LIMIT = 900; // without ALT
const SAFE_INSTRUCTION_DATA_LIMIT_ALT = 750; // with ALT
const FIELD_ELEMENT_BYTES = 32;

/* ---------------- Economic constants ---------------- */

const RENT_SOL_PER_KB = 0.007;
const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

/* ---------------- Types ---------------- */

export interface ProfileResult {
  circuitName: string;

  // Size
  proofBytes: number;
  publicWitnessBytes: number;
  instructionDataBytes: number;
  effectiveInstructionLimit: number;

  // Circuit
  publicInputCount?: number;
  constraintCount?: number;

  // Costs
  totalCU: number;
  priorityFees: Record<string, number>;
  vkRentEstimateSOL?: number;

  // Files
  witnessBytes?: number;
  acirBytes?: number;

  // Status
  fitsInSolanaTx: boolean;
  status: "PASS" | "WARN" | "FAIL";
  warnings: string[];
}

/* ---------------- Path resolution ---------------- */

function resolveCircuitArtifacts(circuitRoot: string) {
  const targetDir = path.join(circuitRoot, "target");

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Missing target/ directory in ${circuitRoot}`);
  }

  const files = fs.readdirSync(targetDir);
  const proofFile = files.find((f) => f.endsWith(".proof"));

  if (!proofFile) {
    throw new Error("No .proof file found. Did you run `sunspot prove`?");
  }

  const circuitName = proofFile.replace(".proof", "");

  return {
    circuitName,
    targetDir,
    proofPath: path.join(targetDir, `${circuitName}.proof`),
    pwPath: path.join(targetDir, `${circuitName}.pw`),
    witnessPath: path.join(targetDir, `${circuitName}.gz`),
    acirPath: path.join(targetDir, `${circuitName}.json`),
    vkPath: path.join(targetDir, `${circuitName}.vk`)
  };
}

/* ---------------- Helpers ---------------- */

function sizeIfExists(filePath: string): number | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return fs.statSync(filePath).size;
}

function estimatePublicInputs(pwPath: string): number | undefined {
  if (!fs.existsSync(pwPath)) return undefined;
  const bytes = fs.readFileSync(pwPath).length;
  return Math.floor(bytes / FIELD_ELEMENT_BYTES);
}

/* ---------------- ACIR analysis ---------------- */

function extractConstraintCount(acirPath: string): number | undefined {
  if (!fs.existsSync(acirPath)) return undefined;

  try {
    const acir = JSON.parse(fs.readFileSync(acirPath, "utf8"));
    return acir.constraints?.length ?? undefined;
  } catch {
    return undefined;
  }
}

/* ---------------- Compute Unit prediction ---------------- */

function predictComputeUnits({
  publicInputs = 0,
  constraintCount = 0
}) {
  const BASE_VERIFY_CU = 150_000;
  const CU_PER_PUBLIC_INPUT = 12_000;
  const CU_PER_10K_CONSTRAINTS = 20_000;

  const constraintCU =
    Math.floor(constraintCount / 10_000) * CU_PER_10K_CONSTRAINTS;

  const totalCU =
    BASE_VERIFY_CU +
    publicInputs * CU_PER_PUBLIC_INPUT +
    constraintCU;

  return totalCU;
}

/* ---------------- Priority fee estimation ---------------- */

function estimatePriorityFees(totalCU: number) {
  const table = {
    low: 200,
    medium: 800,
    high: 2500
  };

  const result: Record<string, number> = {};

  for (const [level, microLamportsPerCU] of Object.entries(table)) {
    const microLamports = totalCU * microLamportsPerCU;
    const lamports = microLamports / MICRO_LAMPORTS_PER_LAMPORT;
    result[level] = Number((lamports / LAMPORTS_PER_SOL).toFixed(6));
  }

  return result;
}

/* ---------------- Rent estimation ---------------- */

function estimateRent(bytes?: number): number | undefined {
  if (!bytes) return undefined;
  return Number(((bytes / 1024) * RENT_SOL_PER_KB).toFixed(4));
}

/* ---------------- Core profiler ---------------- */

export function profileCircuit(
  circuitRoot: string,
  opts?: { usesALT?: boolean }
): ProfileResult {
  const {
    circuitName,
    proofPath,
    pwPath,
    witnessPath,
    acirPath,
    vkPath
  } = resolveCircuitArtifacts(circuitRoot);

  const proofBytes = fs.statSync(proofPath).size;
  const publicWitnessBytes = fs.statSync(pwPath).size;
  const instructionDataBytes = proofBytes + publicWitnessBytes;

  const witnessBytes = sizeIfExists(witnessPath);
  const acirBytes = sizeIfExists(acirPath);
  const publicInputCount = estimatePublicInputs(pwPath);
  const constraintCount = extractConstraintCount(acirPath);

  const usesALT = opts?.usesALT ?? false;
  const effectiveInstructionLimit = usesALT
    ? SAFE_INSTRUCTION_DATA_LIMIT_ALT
    : SAFE_INSTRUCTION_DATA_LIMIT;

  const warnings: string[] = [];

  if (instructionDataBytes > effectiveInstructionLimit) {
    warnings.push(
      `Instruction data (${instructionDataBytes} bytes) exceeds ${
        usesALT ? "ALT-adjusted" : "safe"
      } limit (${effectiveInstructionLimit})`
    );
  }

  if (instructionDataBytes > SOLANA_TX_MAX_BYTES) {
    warnings.push(
      `Instruction data exceeds MAX Solana TX size (${SOLANA_TX_MAX_BYTES})`
    );
  }

  if (publicInputCount && publicInputCount > 8) {
    warnings.push(
      `High public input count (${publicInputCount}). Consider hashing/packing.`
    );
  }

  const totalCU = predictComputeUnits({
    publicInputs: publicInputCount,
    constraintCount
  });

  if (totalCU > 900_000) {
    warnings.push(
      `High CU usage (${totalCU}). Priority fees required to land.`
    );
  }

  const priorityFees = estimatePriorityFees(totalCU);
  const vkRentEstimateSOL = estimateRent(sizeIfExists(vkPath));

  let status: ProfileResult["status"] = "PASS";
  if (instructionDataBytes > SOLANA_TX_MAX_BYTES) status = "FAIL";
  else if (warnings.length > 0) status = "WARN";

  return {
    circuitName,

    proofBytes,
    publicWitnessBytes,
    instructionDataBytes,
    effectiveInstructionLimit,

    publicInputCount,
    constraintCount,

    totalCU,
    priorityFees,
    vkRentEstimateSOL,

    witnessBytes,
    acirBytes,

    fitsInSolanaTx: instructionDataBytes <= SOLANA_TX_MAX_BYTES,
    status,
    warnings
  };
}
