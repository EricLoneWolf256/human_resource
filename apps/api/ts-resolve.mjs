export async function resolve(specifier, context, nextResolve) {
  if (/^\.{1,2}\//.test(specifier) && specifier.endsWith('.js')) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
  }

  return nextResolve(specifier, context);
}
