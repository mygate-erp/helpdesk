import { getCachedListResource, getCachedResource } from "frappe-ui";
import { io } from "socket.io-client";

// extend window object
declare global {
  interface Window {
    site_name: string;
    socketio_port?: string | number;
  }
}

export function initSocket() {
  let host = window.location.hostname;
  let siteName = window.site_name || host;
  let socketPort = window.socketio_port || "9000";
  let port = window.location.port ? `:${socketPort}` : "";
  let protocol = port ? "http" : "https";
  let url = `${protocol}://${host}${port}/${siteName}`;

  const socket = io(url, {
    withCredentials: true,
    reconnectionAttempts: 5,
  });

  socket.on("refetch_resource", (data) => {
    if (data.cache_key) {
      const resource =
        getCachedResource(data.cache_key) ||
        getCachedListResource(data.cache_key);
      if (resource) {
        resource.reload();
      }
    }
  });

  return socket;
}

export const socket = initSocket();
