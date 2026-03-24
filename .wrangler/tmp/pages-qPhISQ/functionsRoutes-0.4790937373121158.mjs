import { onRequest as __api___path___js_onRequest } from "/Users/shaynelarocque/Documents/GitHub/3d-analytics/functions/api/[[path]].js"

export const routes = [
    {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___js_onRequest],
    },
  ]