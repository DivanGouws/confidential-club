// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint256, externalEuint256} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// Confidential content platform contract using per-post payment + FHE-based authorization
contract ConfidentialClub is ZamaEthereumConfig {
    // Platform creator address; the only address allowed to publish and modify posts
    address public immutable creator;
    // Auto-incrementing post ID counter
    uint256 public postCount;

    struct Post {
        // FHE-encrypted key handle (euint256) for each post
        euint256 key;
        // Per-post purchase price (in wei)
        uint256 price;
        // Whether the post exists, to avoid accessing invalid IDs
        bool exists;
    }

    // Post metadata, access control, and statistics
    mapping(uint256 => Post) private posts;
    // Records whether an address has already purchased a post
    mapping(uint256 => mapping(address => bool)) public hasAccess;
    // Mapping from IPFS hash to post ID, used for de-duplication
    mapping(string => uint256) public ipfsHashToPostId;
    // Mapping from post ID to IPFS root hash
    mapping(uint256 => string) public postIdToIpfsHash;
    // Post publish timestamp
    mapping(uint256 => uint256) public postIdToTimestamp;
    // Number of times each post has been purchased
    mapping(uint256 => uint256) public postPurchaseCount;
    // Creator address for each post
    mapping(uint256 => address) public postIdToCreator;
    // Follow relationships and follower statistics
    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(address => uint256) public followerCount;
    mapping(address => uint256) public followingCount;
    // Cumulative earnings and spendings per user
    mapping(address => uint256) public userEarnings;
    mapping(address => uint256) public userSpendings;
    // Cumulative earnings per post
    mapping(uint256 => uint256) public postEarnings;
    // Like and dislike counts per post
    mapping(uint256 => uint256) public postLikeCount;
    mapping(uint256 => uint256) public postDislikeCount;
    // User reaction to a post: 1 = like, -1 = dislike, 0 = no reaction
    mapping(uint256 => mapping(address => int8)) public userPostReaction;
    // CID of user profile stored on IPFS
    mapping(address => string) public userProfileCid;

    event PostPublished(uint256 indexed postId, uint256 price, string ipfsHash);
    event PostPriceUpdated(uint256 indexed postId, uint256 price);
    event PostKeyUpdated(uint256 indexed postId);
    event PostPurchased(uint256 indexed postId, address indexed buyer, uint256 price);
    event UserFollowed(address indexed follower, address indexed following);
    event UserUnfollowed(address indexed follower, address indexed following);
    event PostLiked(uint256 indexed postId, address indexed user);
    event PostDisliked(uint256 indexed postId, address indexed user);
    event PostReactionRemoved(uint256 indexed postId, address indexed user);
    event UserProfileUpdated(address indexed user, string ipfsCid);

    error NotCreator();
    error PostMissing();
    error AlreadyPurchased();
    error NotPurchased();

    // Access control modifier for the platform creator
    modifier onlyCreator() {
        if (msg.sender != creator) {
            revert NotCreator();
        }
        _;
    }

    // Set the platform creator address at deployment time
    constructor() {
        creator = msg.sender;
    }

    // Publish a new post and store the key handle and price on-chain
    function publishPost(
        string memory ipfsHash,
        uint256 price,
        externalEuint256 encryptedKey,
        bytes calldata inputProof
    ) external returns (uint256 postId) {
        require(price > 0, "price=0");
        require(bytes(ipfsHash).length > 0, "ipfsHash empty");
        require(ipfsHashToPostId[ipfsHash] == 0, "ipfsHash exists");

        // Use Zama FHE.fromExternal to convert the off-chain encrypted key into an on-chain euint256 handle
        euint256 key = FHE.fromExternal(encryptedKey, inputProof);

        postId = ++postCount;
        posts[postId] = Post({key: key, price: price, exists: true});
        ipfsHashToPostId[ipfsHash] = postId;
        postIdToIpfsHash[postId] = ipfsHash;
        postIdToTimestamp[postId] = block.timestamp;
        postIdToCreator[postId] = msg.sender;

        // By default, grant the creator access and allow the contract itself to access the key
        hasAccess[postId][msg.sender] = true;
        FHE.allow(key, msg.sender);
        FHE.allowThis(key);
        emit PostPublished(postId, price, ipfsHash);
    }

    // Update the price of an existing post
    function updatePostPrice(uint256 postId, uint256 newPrice) external {
        require(newPrice > 0, "price=0");
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        require(postIdToCreator[postId] == msg.sender, "Not post owner");
        post.price = newPrice;
        emit PostPriceUpdated(postId, newPrice);
    }

    // Replace the encrypted key handle for a specific post
    function updatePostKey(uint256 postId, externalEuint256 encryptedKey, bytes calldata inputProof) external {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        require(postIdToCreator[postId] == msg.sender, "Not post owner");
        euint256 key = FHE.fromExternal(encryptedKey, inputProof);
        post.key = key;
        // Only re-authorize the contract itself; existing buyers must repurchase to obtain the new key
        FHE.allowThis(key);
        emit PostKeyUpdated(postId);
    }

    // Entry point for per-post payment: charge, authorize access, and return the key handle to the frontend
    function buyPost(uint256 postId) external payable returns (bytes32 handle) {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        if (hasAccess[postId][msg.sender]) {
            revert AlreadyPurchased();
        }
        require(msg.value >= post.price, "underpay");

        // Mark the user as having purchased the post and increment purchase count
        hasAccess[postId][msg.sender] = true;
        postPurchaseCount[postId]++;
        // Use FHE.allow to authorize the buyer address to decrypt the post key
        FHE.allow(post.key, msg.sender);

        // Record earnings for the creator and the post
        address postCreator = postIdToCreator[postId];
        userEarnings[postCreator] += post.price;
        postEarnings[postId] += post.price;

        emit PostPurchased(postId, msg.sender, post.price);

        // Handle refund of any overpaid amount
        if (msg.value > post.price) {
            unchecked {
                (bool refundOk, ) = msg.sender.call{value: msg.value - post.price}("");
                require(refundOk, "refund failed");
            }
        }

        // Settle the post revenue to the creator address
        (bool payoutOk, ) = payable(postCreator).call{value: post.price}("");
        require(payoutOk, "payout failed");

        // Record the buyer's cumulative spending
        userSpendings[msg.sender] += post.price;

        // Convert the euint256 handle to bytes32 and return it to the frontend for userDecrypt
        handle = FHE.toBytes32(post.key);
    }

    // Record a like reaction from a user for a post
    function likePost(uint256 postId) external {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        if (!hasAccess[postId][msg.sender]) {
            revert NotPurchased();
        }

        int8 currentReaction = userPostReaction[postId][msg.sender];

        if (currentReaction == 1) {
            return;
        }

        if (currentReaction == -1) {
            postDislikeCount[postId]--;
        }

        userPostReaction[postId][msg.sender] = 1;
        postLikeCount[postId]++;

        emit PostLiked(postId, msg.sender);
    }

    // Record a dislike reaction from a user for a post
    function dislikePost(uint256 postId) external {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        if (!hasAccess[postId][msg.sender]) {
            revert NotPurchased();
        }

        int8 currentReaction = userPostReaction[postId][msg.sender];

        if (currentReaction == -1) {
            return;
        }

        if (currentReaction == 1) {
            postLikeCount[postId]--;
        }

        userPostReaction[postId][msg.sender] = -1;
        postDislikeCount[postId]++;

        emit PostDisliked(postId, msg.sender);
    }

    // Clear a user's like/dislike reaction for a post
    function removeReaction(uint256 postId) external {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        if (!hasAccess[postId][msg.sender]) {
            revert NotPurchased();
        }

        int8 currentReaction = userPostReaction[postId][msg.sender];

        if (currentReaction == 0) {
            return;
        }

        if (currentReaction == 1) {
            postLikeCount[postId]--;
        } else if (currentReaction == -1) {
            postDislikeCount[postId]--;
        }

        userPostReaction[postId][msg.sender] = 0;

        emit PostReactionRemoved(postId, msg.sender);
    }

    // Provide basic post information and whether it has been purchased by the caller
    function getPost(uint256 postId) external view returns (uint256 price, bool exists, bool purchased) {
        Post storage post = posts[postId];
        exists = post.exists;
        price = post.price;
        if (exists) {
            purchased = hasAccess[postId][msg.sender];
        }
    }

    // Return price, timestamp, creator follower stats, likes/dislikes, and current user's reaction in a single call
    function getPostFullInfo(
        uint256 postId
    )
        external
        view
        returns (
            uint256 price,
            bool exists,
            bool purchased,
            uint256 timestamp,
            uint256 purchaseCount,
            address postCreator,
            uint256 creatorFollowerCount,
            bool isFollowingCreator,
            uint256 likeCount,
            uint256 dislikeCount,
            int8 userReaction
        )
    {
        Post storage post = posts[postId];
        exists = post.exists;
        price = post.price;
        purchased = hasAccess[postId][msg.sender];
        timestamp = postIdToTimestamp[postId];
        purchaseCount = postPurchaseCount[postId];
        postCreator = postIdToCreator[postId];
        creatorFollowerCount = followerCount[postCreator];
        isFollowingCreator = isFollowing[msg.sender][postCreator];
        likeCount = postLikeCount[postId];
        dislikeCount = postDislikeCount[postId];
        userReaction = userPostReaction[postId][msg.sender];
    }

    // Return the ciphertext handle if the caller has access rights
    function getCiphertextHandle(uint256 postId) external view returns (bytes32) {
        Post storage post = posts[postId];
        if (!post.exists) {
            revert PostMissing();
        }
        require(msg.sender == postIdToCreator[postId] || hasAccess[postId][msg.sender], "no access");
        // Only convert the euint256 handle to bytes32 here; decryption is done off-chain
        return FHE.toBytes32(post.key);
    }

    // Return the list of post IDs purchased by a specific user (excluding their own posts)
    function getUserPurchasedPosts(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (hasAccess[i][user] && user != postIdToCreator[i]) {
                count++;
            }
        }

        uint256[] memory purchasedPosts = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (hasAccess[i][user] && user != postIdToCreator[i]) {
                purchasedPosts[index] = i;
                index++;
            }
        }

        return purchasedPosts;
    }

    // Create a follow relationship and update follower/following counters
    function follow(address userToFollow) external {
        require(msg.sender != userToFollow, "Cannot follow yourself");
        require(!isFollowing[msg.sender][userToFollow], "Already following");

        isFollowing[msg.sender][userToFollow] = true;
        followerCount[userToFollow]++;
        followingCount[msg.sender]++;

        emit UserFollowed(msg.sender, userToFollow);
    }

    // Cancel a follow relationship
    function unfollow(address userToUnfollow) external {
        require(isFollowing[msg.sender][userToUnfollow], "Not following");

        isFollowing[msg.sender][userToUnfollow] = false;
        followerCount[userToUnfollow]--;
        followingCount[msg.sender]--;

        emit UserUnfollowed(msg.sender, userToUnfollow);
    }

    // Return the list of post IDs published by accounts the user is following
    function getFollowingPosts(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            address postCreator = postIdToCreator[i];
            if (isFollowing[user][postCreator]) {
                count++;
            }
        }

        uint256[] memory followingPosts = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = postCount; i >= 1; i--) {
            address postCreator = postIdToCreator[i];
            if (isFollowing[user][postCreator]) {
                followingPosts[index] = i;
                index++;
            }
        }

        return followingPosts;
    }

    // Return the list of addresses the user is following
    function getFollowingList(address user) external view returns (address[] memory) {
        uint256 count = followingCount[user];
        if (count == 0) return new address[](0);

        address[] memory following = new address[](count);
        uint256 index = 0;

        for (uint256 i = 1; i <= postCount; i++) {
            address postCreator = postIdToCreator[i];
            if (postCreator != address(0) && isFollowing[user][postCreator]) {
                bool alreadyAdded = false;
                for (uint256 j = 0; j < index; j++) {
                    if (following[j] == postCreator) {
                        alreadyAdded = true;
                        break;
                    }
                }
                if (!alreadyAdded) {
                    following[index] = postCreator;
                    index++;
                    if (index >= count) break;
                }
            }
        }

        return following;
    }

    // Return the list of all post IDs created by a specific creator
    function getCreatorPosts(address creatorAddress) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (posts[i].exists && postIdToCreator[i] == creatorAddress) {
                count++;
            }
        }

        uint256[] memory creatorPosts = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (posts[i].exists && postIdToCreator[i] == creatorAddress) {
                creatorPosts[index] = i;
                index++;
            }
        }

        return creatorPosts;
    }

    // Return the list of post IDs published by a specific user
    function getUserPosts(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (postIdToCreator[i] == user) {
                count++;
            }
        }

        uint256[] memory userPosts = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = postCount; i >= 1; i--) {
            if (postIdToCreator[i] == user) {
                userPosts[index] = i;
                index++;
            }
        }

        return userPosts;
    }

    // Query the total earnings of a single user
    function getUserEarnings(address user) external view returns (uint256) {
        return userEarnings[user];
    }

    // Query the cumulative earnings of a single post
    function getPostEarnings(uint256 postId) external view returns (uint256) {
        return postEarnings[postId];
    }

    // Provide simplified info of a user's earnings and follower count
    function getUserStats(address user) external view returns (uint256 earnings, uint256 followers) {
        earnings = userEarnings[user];
        followers = followerCount[user];
    }

    struct PostStatInfo {
        // Aggregated statistics of a single post, for convenient batch fetching on the frontend
        uint256 postId;
        uint256 price;
        uint256 purchaseCount;
        uint256 earnings;
        uint256 likeCount;
        uint256 dislikeCount;
    }

    // Return full statistics from the creator's perspective
    function getUserFullStats(
        address user
    )
        external
        view
        returns (
            uint256 totalEarnings,
            uint256 totalSpent,
            uint256 followers,
            uint256 userPostCount,
            PostStatInfo[] memory postStats
        )
    {
        totalEarnings = userEarnings[user];
        totalSpent = userSpendings[user];
        followers = followerCount[user];

        uint256 count = 0;
        for (uint256 i = 1; i <= postCount; i++) {
            if (postIdToCreator[i] == user) {
                count++;
            }
        }

        userPostCount = count;
        postStats = new PostStatInfo[](count);

        uint256 index = 0;
        for (uint256 i = postCount; i >= 1; i--) {
            if (postIdToCreator[i] == user) {
                Post storage post = posts[i];
                postStats[index] = PostStatInfo({
                    postId: i,
                    price: post.price,
                    purchaseCount: postPurchaseCount[i],
                    earnings: postEarnings[i],
                    likeCount: postLikeCount[i],
                    dislikeCount: postDislikeCount[i]
                });
                index++;
                if (index >= count) break;
            }
        }
    }

    // Bind the user's profile IPFS CID to their address
    function registerProfile(string calldata ipfsCid) external {
        require(bytes(ipfsCid).length > 0, "Invalid IPFS CID");
        userProfileCid[msg.sender] = ipfsCid;
        emit UserProfileUpdated(msg.sender, ipfsCid);
    }

    // Query the profile CID bound to a user address
    function getUserProfile(address user) external view returns (string memory) {
        return userProfileCid[user];
    }
}
