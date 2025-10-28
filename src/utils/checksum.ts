import { createHash } from "crypto";

/**
 * Computes SHA-256 checksum of a buffer or data
 * @param data - Buffer or string to compute checksum for
 * @returns Hexadecimal string representation of the SHA-256 hash
 */
export function computeChecksum(data: Buffer | string): string {
	const hash = createHash("sha256");
	hash.update(data);
	return hash.digest("hex");
}
