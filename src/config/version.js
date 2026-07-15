import version from "../../version.json";

export const API_VERSION = version.apiVersion;

/**
 * Validate that the given client version matches the expected API version.
 * Throws an Error if there is a mismatch.
 *
 * @param {number} clientVersion - The version reported by the connecting client
 */
export function assertApiVersion(clientVersion) {
  if (clientVersion !== API_VERSION) {
    throw new Error(
      `API version mismatch: extension expects v${API_VERSION}, client sent v${clientVersion}. ` +
      `Please reload the extension or upgrade the local server.`
    );
  }
}