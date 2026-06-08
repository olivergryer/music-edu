export const IS_DEV =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && /-git-dev[-.]/.test(window.location.hostname))
