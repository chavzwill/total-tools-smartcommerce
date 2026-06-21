export type Route = { path: string; query: URLSearchParams };

export function getRoute(): Route {
  const raw = window.location.hash.slice(1) || "/";
  const [path, search = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(search) };
}

export function go(path: string) {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function routeHref(path: string) {
  return `#${path.startsWith("/") ? path : `/${path}`}`;
}
