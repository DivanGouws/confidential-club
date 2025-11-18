import { expect } from "chai";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { FhevmType, HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Basic FHEVM Encryption/Decryption Tests", function () {
  let fhevm: HardhatFhevmRuntimeEnvironment;
  let signer1: HardhatEthersSigner;
  let signer2: HardhatEthersSigner;

  before(async function () {
    // Initialize FHEVM environment
    fhevm = hre.fhevm;

    // Ensure we are running in mock mode for tests
    if (!fhevm.isMock) {
      console.log("[Warning] Running on real network with actual FHE encryption");
    } else {
      console.log("[Info] Running in mock mode for testing");
    }

    // Get test signers
    [signer1, signer2] = await ethers.getSigners();
    console.log("Signer 1:", signer1.address);
    console.log("Signer 2:", signer2.address);
  });

  describe("Encryption Tests", function () {
    it("should encrypt different data types", async function () {
      // Dummy contract address (used to bind encryption)
      const dummyContractAddress = "0x0000000000000000000000000000000000000001";

      // Create encrypted input
      const input = fhevm.createEncryptedInput(dummyContractAddress, signer1.address);

      // Encrypt different data types
      input.addBool(true); // boolean value
      input.add8(255); // 8-bit integer
      input.add16(65535); // 16-bit integer
      input.add32(4294967295); // 32-bit integer
      input.add64(BigInt("18446744073709551615")); // 64-bit integer

      // Try adding 128-bit value (if supported)
      try {
        (input as any).add128(BigInt("340282366920938463463374607431768211455"));
        console.log("✓ 128-bit encryption supported");
      } catch {
        console.log("✗ 128-bit encryption not available");
      }

      // Perform encryption
      const encrypted = await input.encrypt();

      // Verify encryption result
      expect(encrypted).to.have.property("handles");
      expect(encrypted).to.have.property("inputProof");
      expect(encrypted.handles).to.be.an("array");
      expect(encrypted.handles.length).to.be.at.least(5);

      console.log(`Encrypted ${encrypted.handles.length} values`);
      console.log(
        "Handle sizes:",
        encrypted.handles.map((h) => h.length),
      );
    });

    it("should create unique encryptions for same value", async function () {
      const dummyContractAddress = "0x0000000000000000000000000000000000000001";
      const testValue = 42;

      // First encryption
      const input1 = fhevm.createEncryptedInput(dummyContractAddress, signer1.address);
      input1.add32(testValue);
      const encrypted1 = await input1.encrypt();

      // Second encryption of the same value
      const input2 = fhevm.createEncryptedInput(dummyContractAddress, signer1.address);
      input2.add32(testValue);
      const encrypted2 = await input2.encrypt();

      // Verify that the two encryptions produce different handles (randomized encryption)
      expect(encrypted1.handles[0]).to.not.equal(encrypted2.handles[0]);
      console.log("✓ Same value produces different ciphertexts (randomized encryption)");
    });
  });

  describe("Decryption Tests with Contract", function () {
    let testContract: any;
    let contractAddress: string;

    beforeEach(async function () {
      // Deploy a simple test contract
      const SimpleStorage = await ethers.getContractFactory("ConfidentialClub");
      testContract = await SimpleStorage.deploy();
      await testContract.waitForDeployment();
      contractAddress = await testContract.getAddress();
      console.log("Test contract deployed at:", contractAddress);
    });

    it("should encrypt and decrypt uint256", async function () {
      // Test 256-bit integer value
      const testValue = BigInt("0xDEADBEEFCAFEBABE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF");

      // Create encrypted input
      const input = fhevm.createEncryptedInput(contractAddress, signer1.address);

      // Try add256; if not supported, fall back to add128
      let is256Supported = false;
      try {
        (input as any).add256(testValue);
        is256Supported = true;
      } catch {
        console.log("Using add128 fallback for 256-bit value");
        const low128 = testValue & ((1n << 128n) - 1n);
        (input as any).add128(low128);
      }

      const encrypted = await input.encrypt();
      const handle = encrypted.handles[0];
      const inputProof = encrypted.inputProof;

      // Publish to contract (using existing publishPost function)
      const tx = await testContract
        .connect(signer1)
        .publishPost(`TestIPFS${Date.now()}`, ethers.parseEther("0.001"), handle, inputProof);
      await tx.wait();

      // Retrieve handle and decrypt
      const retrievedHandle = await testContract.connect(signer1).getCiphertextHandle(1);

      // Decrypt
      const decrypted = await fhevm.userDecryptEuint(
        is256Supported ? FhevmType.euint256 : FhevmType.euint128,
        retrievedHandle,
        contractAddress,
        signer1,
      );

      if (is256Supported) {
        expect(decrypted).to.equal(testValue);
        console.log("✓ 256-bit encryption/decryption successful");
      } else {
        expect(decrypted).to.equal(testValue & ((1n << 128n) - 1n));
        console.log("✓ 128-bit encryption/decryption successful");
      }
    });

    it("should enforce access control in decryption", async function () {
      // signer1 encrypts a value
      const secretValue = BigInt("0x1234567890ABCDEF");
      const input = fhevm.createEncryptedInput(contractAddress, signer1.address);

      // Use add128 or add256 to handle large integer value
      try {
        (input as any).add256(secretValue);
      } catch {
        try {
          (input as any).add128(secretValue);
        } catch {
          // Finally fall back to add64
          input.add64(secretValue);
        }
      }

      const encrypted = await input.encrypt();

      // signer1 publishes the post
      await (
        await testContract
          .connect(signer1)
          .publishPost(`Secret${Date.now()}`, ethers.parseEther("0.01"), encrypted.handles[0], encrypted.inputProof)
      ).wait();

      // signer1 (creator) can get the handle
      const handle = await testContract.connect(signer1).getCiphertextHandle(1);
      expect(handle).to.not.be.null;

      // signer2 (unauthorized user) cannot get the handle
      await expect(testContract.connect(signer2).getCiphertextHandle(1)).to.be.reverted;

      console.log("✓ Access control enforced correctly");
    });
  });

  describe("Advanced Encryption Features", function () {
    it("should support batch encryption", async function () {
      const dummyContractAddress = "0x0000000000000000000000000000000000000001";

      // Batch-encrypt multiple values
      const input = fhevm.createEncryptedInput(dummyContractAddress, signer1.address);

      const values = {
        bool: true,
        uint8: 100,
        uint16: 1000,
        uint32: 100000,
        uint64: BigInt("1000000000"),
      };

      input.addBool(values.bool);
      input.add8(values.uint8);
      input.add16(values.uint16);
      input.add32(values.uint32);
      input.add64(values.uint64);

      const encrypted = await input.encrypt();

      // Verify batch encryption
      expect(encrypted.handles).to.have.lengthOf(5);
      expect(encrypted.inputProof).to.not.be.null;

      console.log("✓ Batch encryption of 5 values successful");
      console.log("  - Handles generated:", encrypted.handles.length);
      console.log("  - Proof size:", encrypted.inputProof.length, "bytes");
    });

    it("should validate encryption binding", async function () {
      const contract1 = "0x0000000000000000000000000000000000000001";
      const contract2 = "0x0000000000000000000000000000000000000002";

      // Create encryptions bound to different contracts
      const input1 = fhevm.createEncryptedInput(contract1, signer1.address);
      input1.add32(100);
      const enc1 = await input1.encrypt();

      const input2 = fhevm.createEncryptedInput(contract2, signer1.address);
      input2.add32(100);
      const enc2 = await input2.encrypt();

      // Verify that encryptions bound to different contracts are distinct
      expect(enc1.handles[0]).to.not.equal(enc2.handles[0]);
      expect(enc1.inputProof).to.not.equal(enc2.inputProof);

      console.log("✓ Encryption correctly bound to different contracts");
    });
  });
});
