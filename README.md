# Confidential Club

**Powered by Zama FHE technology, opening a new era for encrypted on-chain paid content.**

Confidential Club is a confidential content monetization platform built on Zama FHEVM. It leverages Zama's encrypted storage and access control to provide secure on-chain key management and authorization, combined with off-chain encrypted content storage.

## Overview

The platform supports mixed text and image posts, and creators can choose which text segments and images should be encrypted to achieve fine-grained access control. With Zama FHEVM, content keys are stored on-chain in encrypted form (euint256) and are never exposed in plaintext.

## Key Features

- **Encrypted key storage and access control** based on Zama FHEVM (euint256 + ACL)
- **Mixed text and image posts** with flexible content composition
- **Selective encryption** - choose specific text segments or images to encrypt
- **Per-post pricing model** with flexible creator-defined pricing
- **Hybrid architecture** - on-chain key management with off-chain encrypted content storage
- **Decentralized platform** for paid content monetization

## Architecture

The platform adopts a hybrid encryption architecture:

- **Smart contract layer:** `ConfidentialClub.sol` manages post publishing, purchases, and on-chain authorization
- **Key management:** Zama FHEVM stores AES keys as encrypted euint256 values and enforces access control via ACL + Gateway
- **Content encryption:** AES-GCM symmetric encryption for off-chain text and image content
- **Storage layer:** IPFS/Pinata decentralized storage for encrypted content
- **Frontend layer:** Next.js 16 (App Router) + React 19 + custom Relayer SDK integration (EIP-712 signatures + `userDecrypt`)

## Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI Library:** React 19
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **Wallet:** RainbowKit + Wagmi v2
- **Authentication:** SIWE (Sign-In with Ethereum)
- **Caching:** idb-keyval

### Blockchain
- **Smart Contracts:** Solidity
- **FHE Framework:** Zama FHEVM v0.8
- **Development:** Hardhat
- **Testing:** Hardhat + Mocha

### Storage & Encryption
- **File Storage:** IPFS/Pinata
- **Encryption:** AES-GCM (256-bit)
- **FHE:** Zama Relayer SDK

## Getting Started

### Prerequisites

```bash
Node.js >= 18.0.0
npm or yarn or pnpm
```

### Installation

```bash
# Clone the repository
git clone https://github.com/DivanGouws/confidential-club.git
cd confidential-club

# Install dependencies
npm install
```

### Environment Setup

Create a `.env.local` file in the root directory:

```env
# Pinata IPFS
NEXT_PUBLIC_PINATA_GATEWAY_URL=your_pinata_gateway_url
PINATA_JWT=your_pinata_jwt_token

# Contract Configuration
NEXT_PUBLIC_CONTRACT_ADDRESS=your_contract_address
NEXT_PUBLIC_CHAIN_ID=9000

# Optional: Session Secret
SESSION_SECRET=your_session_secret
```

### Development

```bash
# Run the development server
npm run dev

# Open http://localhost:3000
```

### Build for Production

```bash
npm run build
npm start
```

## Workflow

### Publishing Content

1. Generate a random AES key (shared by text and images within the same post)
2. Select text segments that should be encrypted and encrypt them with the AES key
3. Select images that should be encrypted and encrypt them using AES-GCM (each image uses a different random IV)
4. Store non-encrypted images in plaintext
5. Package all content into a directory structure and upload it to IPFS (including `content.json` and image files)
6. Encrypt the AES key off-chain with the FHE public key and submit it to the contract as an euint256 for persistent storage
7. The contract calls `FHE.allowThis(key)` to grant itself access to the encrypted key

### Purchasing Content

1. The user calls `buyPost` to pay for the content
2. The contract executes `FHE.allow(post.key, buyer)` to authorize the buyer
3. The frontend retrieves the plaintext AES key via Relayer SDK `userDecrypt`
4. Download the directory content from IPFS
5. Use the AES key to decrypt encrypted text segments and images
6. Plaintext images are displayed directly; decrypted content is rendered in full

## Security

With Zama FHEVM, content keys are stored on-chain in encrypted form (euint256) and are never exposed in plaintext. The contract only stores the FHE-encrypted key handle (euint256), not the AES key itself. Only authorized users, via ACL rules and the Gateway service, can decrypt the key and access the off-chain encrypted content.

Off-chain content is protected using AES-GCM symmetric encryption: text and images share the same AES key, while each image uses an independent random IV. Knowing the IPFS address alone is not sufficient to obtain the plaintext; the AES key must first be decrypted from the on-chain handle.

## Project Structure

```
confidential-club/
├── contracts/              # Smart contracts
│   └── ConfidentialClub.sol
├── src/
│   ├── app/               # Next.js app directory
│   ├── components/        # React components
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utility libraries
├── test/                  # Contract tests
└── public/                # Static assets
```

## Smart Contract

The `ConfidentialClub.sol` contract provides the following key functions:

- `publishPost(euint256 key, uint256 price)` - Publish a new post
- `buyPost(uint256 postId)` - Purchase access to a post
- `updatePostPrice(uint256 postId, uint256 newPrice)` - Update post price
- `updatePostKey(uint256 postId, euint256 newKey)` - Update post encryption key
- `getPost(uint256 postId)` - Get post metadata
- `getCiphertextHandle(uint256 postId)` - Get encrypted key handle

## Future Roadmap

- Confidential voting features (planned)
- Confidential auction mechanisms (planned)
- Additional privacy-preserving application scenarios (planned)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is part of the Zama competition submission.

---

**Built with Zama FHEVM for the Zama Competition**
