// TypeScript rewrites `import()` into `require()` when compiling to
// CommonJS (this project's module target), which breaks any package that
// ships ESM-only with no CJS entry point — p-queue among them. Routing the
// import specifier through `Function` hides it from that static rewrite, so
// Node performs a genuine ESM dynamic import at runtime regardless of the
// surrounding CommonJS module.
//
// unpdf and mammoth (see fileProcessor.ts) use this same helper even though
// a plain `await import(...)` happens to work for them today — both ship a
// CJS build, so TS's downleveled `require()` accidentally succeeds. That's
// an accident of their packaging, not a guarantee; either could drop CJS
// support in a future release and silently break the same way p-queue did.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;
