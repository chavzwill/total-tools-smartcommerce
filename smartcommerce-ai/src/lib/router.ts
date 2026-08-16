export type Route = { path: string; query: URLSearchParams };

export function getRoute(): Route {
  const raw = window.location.hash.slice(1) || "/";
  const [path, search = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(search) };
}

export function go(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const nextHash = `#${normalized}`;

  if (window.location.hash === nextHash) {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    return;
  }

  window.location.hash = normalized;
}

export function routeHref(path: string) {
  return `#${path.startsWith("/") ? path : `/${path}`}`;
}
