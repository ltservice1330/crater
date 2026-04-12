/**
 * Copyright 2025 RAIDS Lab
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Hash a password using SHA-256 with a salt derived from the username
 * This provides basic protection for password transmission over HTTPS
 *
 * @param password - The plaintext password
 * @param username - The username (used as salt)
 * @returns Promise<string> - The hex-encoded hash
 */
export async function hashPassword(password: string, username: string): Promise<string> {
  // Create a deterministic salt from username to ensure consistent hashing
  const salt = `crater_${username}_salt`

  // Combine password with salt
  const saltedPassword = `${salt}:${password}`

  // Convert string to Uint8Array
  const encoder = new TextEncoder()
  const data = encoder.encode(saltedPassword)

  // Hash using SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}
