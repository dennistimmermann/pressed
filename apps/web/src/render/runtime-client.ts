import { createRuntimeClient, type RuntimeClient } from '@/editor/runtime-client.ts'

/**
 * One runtime frame for the whole app — preview renders and print renders share it, so
 * template code compiles in exactly one sandboxed null-origin document (spec §4.3).
 * Created on first use: the frame appends itself to <body>.
 */
let client: RuntimeClient | null = null
// BASE_URL-aware: on GitHub Pages the app lives under /<repo>/, not /.
export const runtime = () => (client ??= createRuntimeClient(`${import.meta.env.BASE_URL}runtime.html`))
