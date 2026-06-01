// Jest shim for the `bare-buffer` module.
//
// `bare-buffer` is a Bare-runtime native addon that relies on `require.addon`,
// which does not exist under Node/Jest and throws "require.addon is not a
// function" at import time. Under test we only need a `Buffer` that behaves
// like Node's, so we re-export Node's built-in Buffer here. This is wired up
// via `moduleNameMapper` in package.json's Jest config.

import { Buffer } from 'node:buffer'

export { Buffer }
export default Buffer
