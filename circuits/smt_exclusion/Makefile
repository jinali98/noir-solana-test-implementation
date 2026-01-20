# Makefile for Noir circuit compilation and proof generation
# Usage: make [CIRCUIT=circuit_name]

# Default circuit name
CIRCUIT ?= smt_exclusion

# Target directory
TARGET_DIR = target

.PHONY: all execute compile setup prove verify deploy clean

# Run all steps in sequence
all: execute compile setup prove verify deploy

# Step 1: Execute nargo
execute:
	@echo "Running nargo execute..."
	nargo execute

# Step 2: Compile ACIR to CCS
compile: execute
	@echo "Compiling $(CIRCUIT).json to $(CIRCUIT).ccs..."
	cd $(TARGET_DIR) && sunspot compile $(CIRCUIT).json

# Step 3: Generate proving and verifying keys
setup: compile
	@echo "Generating proving and verifying keys..."
	cd $(TARGET_DIR) && sunspot setup $(CIRCUIT).ccs

# Step 4: Create Groth16 proof
prove: setup
	@echo "Creating Groth16 proof..."
	cd $(TARGET_DIR) && sunspot prove $(CIRCUIT).json $(CIRCUIT).gz $(CIRCUIT).ccs $(CIRCUIT).pk

# Step 5: Verify the proof
verify: prove
	@echo "Verifying proof..."
	cd $(TARGET_DIR) && sunspot verify $(CIRCUIT).vk $(CIRCUIT).proof $(CIRCUIT).pw

# Step 6: Create Solana verification program
deploy: verify
	@echo "Creating Solana verification program..."
	cd $(TARGET_DIR) && sunspot deploy $(CIRCUIT).vk

# Clean generated files
clean:
	@echo "Cleaning generated files..."
	rm -f $(TARGET_DIR)/$(CIRCUIT).ccs
	rm -f $(TARGET_DIR)/$(CIRCUIT).pk
	rm -f $(TARGET_DIR)/$(CIRCUIT).vk
	rm -f $(TARGET_DIR)/$(CIRCUIT).proof
	rm -f $(TARGET_DIR)/$(CIRCUIT).pw
