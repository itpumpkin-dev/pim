import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo: Echo<'pusher'>;
    }
}

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'pusher',
    key: import.meta.env.VITE_PUSHER_APP_KEY,
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
    forceTLS: true,
    // Session-cookie auth (this app has no Sanctum/API token layer), so the
    // private-channel auth request is authenticated the same way every other
    // same-origin request is: via the session cookie + XSRF-TOKEN header.
    authorizer: (channel: { name: string }) => ({
        authorize: (socketId: string, callback: (error: boolean, data?: unknown) => void) => {
            fetch('/broadcasting/auth', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': xsrfToken(),
                },
                body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Broadcast auth failed with status ${response.status}`);
                    }

                    return response.json();
                })
                .then((data) => callback(false, data))
                .catch((error) => callback(true, error));
        },
    }),
});

export default window.Echo;
