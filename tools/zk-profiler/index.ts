import { fileURLToPath } from "url";
import path from "path";
import { profileCircuit } from "./profiler.ts";

/* ---------------- ESM-safe entry ---------------- */

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  const [circuitRoot] = process.argv.slice(2);

  if (!circuitRoot) {
    console.error(
      "\nUsage:\n  zk-profiler <path-to-circuit>\n\nExample:\n  zk-profiler circuits/one\n"
    );
    process.exit(1);
  }

  try {
    const result = profileCircuit(path.resolve(circuitRoot));

    console.log("\n🔍 Solana ZK Profiling Report\n");
    console.log(`Circuit: ${result.circuitName}\n`);

    /* ---------------- Size ---------------- */

    console.log("📦 Transaction Size");
    console.log(`  Proof size:              ${result.proofBytes} bytes`);
    console.log(`  Public witness size:     ${result.publicWitnessBytes} bytes`);
    console.log(`  Instruction data size:   ${result.instructionDataBytes} bytes`);
    console.log(
      `  Instruction budget:      ${result.effectiveInstructionLimit} bytes`
    );
    console.log(
      `  Fits budget:             ${
        result.instructionDataBytes <= result.effectiveInstructionLimit
          ? "✅ YES"
          : "❌ NO"
      }`
    );

    /* ---------------- Circuit ---------------- */

    console.log("\n🧠 Circuit Characteristics");
    if (result.publicInputCount !== undefined) {
      console.log(`  Public inputs:           ${result.publicInputCount}`);
    }
    if (result.constraintCount !== undefined) {
      console.log(`  Constraint count:        ${result.constraintCount}`);
    }

    /* ---------------- Compute ---------------- */

    console.log("\n⚡ Compute Cost");
    console.log(
      `  Estimated compute units: ${result.totalCU.toLocaleString()}`
    );

    if (result.totalCU > 900_000) {
      console.log(
        "  ⚠️  High-CU transaction — priority fee required to land"
      );
    }

    /* ---------------- Fees ---------------- */

    console.log("\n💸 Priority Fee Estimate (SOL)");
    for (const [level, sol] of Object.entries(result.priorityFees)) {
      console.log(`  ${level.padEnd(6)}: ${sol}`);
    }

    /* ---------------- Rent ---------------- */

    if (result.vkRentEstimateSOL !== undefined) {
      console.log("\n🏦 Storage (Rent)");
      console.log(
        `  Verification key rent:   ~${result.vkRentEstimateSOL} SOL (one-time)`
      );
    }

    /* ---------------- Artifacts ---------------- */

    console.log("\n📁 Artifact Sizes");
    if (result.acirBytes !== undefined) {
      console.log(`  ACIR size:               ${result.acirBytes} bytes`);
    }
    if (result.witnessBytes !== undefined) {
      console.log(`  Private witness size:    ${result.witnessBytes} bytes`);
    }

    /* ---------------- Summary ---------------- */

    console.log("\n🧾 Summary");
    console.log(
      `  Solana tx fit:           ${
        result.fitsInSolanaTx ? "✅ YES" : "❌ NO"
      }`
    );
    console.log(`  Status:                 ${result.status}`);

    if (result.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      for (const w of result.warnings) {
        console.log(`  - ${w}`);
      }
    }

    console.log();

    if (result.status === "FAIL") {
      process.exit(2);
    }
  } catch (err: any) {
    console.error("Profiling failed:", err.message);
    process.exit(1);
  }
}
