const enableNotificationsButton = document.getElementById("enable-notifications");
const notificationForm = document.getElementById("notification-form");
const notificationStatus = document.getElementById("notification-status");
const notificationList = document.getElementById("notification-list");
const sendNotificationButton = document.getElementById("send-notification");
const adminTokenInput = document.getElementById("notification-admin-token");
const notificationStorageKey = "biodomo-notifications";

let vapidPublicKey;
let apiReady = false;
let subscribed = false;

function setNotificationStatus(message) {
    notificationStatus.textContent = message;
}

function readNotifications() {
    try {
        const savedNotifications = JSON.parse(localStorage.getItem(notificationStorageKey) || "[]");
        return Array.isArray(savedNotifications) ? savedNotifications : [];
    } catch (error) {
        console.error("No se pudieron leer las notificaciones guardadas:", error);
        return [];
    }
}

function renderNotifications() {
    const notifications = readNotifications();
    notificationList.replaceChildren();

    if (notifications.length === 0) {
        const emptyMessage = document.createElement("li");
        emptyMessage.className = "notification-empty";
        emptyMessage.textContent = "Todavía no has enviado notificaciones.";
        notificationList.append(emptyMessage);
        return;
    }

    notifications.forEach((notification) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        const message = document.createElement("p");
        const time = document.createElement("time");

        title.textContent = notification.title;
        message.textContent = notification.message;
        time.dateTime = notification.sentAt;
        time.textContent = new Date(notification.sentAt).toLocaleString();
        item.append(title, message, time);
        notificationList.append(item);
    });
}

function updateControls() {
    const supported = "Notification" in window
        && "serviceWorker" in navigator
        && "PushManager" in window
        && window.isSecureContext;

    enableNotificationsButton.disabled = !supported || !apiReady || Notification.permission === "denied";
    enableNotificationsButton.hidden = subscribed;
    sendNotificationButton.disabled = !apiReady || !subscribed;
}

function decodeBase64Url(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function readApiResponse(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || `El servidor respondió ${response.status}.`);
    }
    return result;
}

async function registerSubscription(registration) {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeBase64Url(vapidPublicKey)
        });
    }

    await readApiResponse(await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
    }));
    subscribed = true;
}

async function initialize() {
    const supported = "Notification" in window
        && "serviceWorker" in navigator
        && "PushManager" in window
        && window.isSecureContext;

    if (!supported) {
        setNotificationStatus("Push requiere un navegador compatible y HTTPS o localhost.");
        updateControls();
        return;
    }

    try {
        const config = await readApiResponse(await fetch("/api/push/config", { cache: "no-store" }));
        vapidPublicKey = config.publicKey;
        apiReady = true;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") {
            await registerSubscription(registration);
            setNotificationStatus("Este dispositivo está suscrito a las notificaciones push.");
        } else {
            setNotificationStatus("Activa las notificaciones para suscribir este dispositivo.");
        }
    } catch (error) {
        console.error("No se pudo inicializar Push de BioDomo:", error);
        setNotificationStatus(`No se pudo conectar con el servicio push: ${error.message}`);
    }
    updateControls();
}

enableNotificationsButton.addEventListener("click", async () => {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            setNotificationStatus("No se concedió permiso para mostrar notificaciones.");
            updateControls();
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        await registerSubscription(registration);
        setNotificationStatus("Dispositivo suscrito. Ya puede recibir envíos push remotos.");
    } catch (error) {
        console.error("No se pudo suscribir a Push:", error);
        setNotificationStatus(`No se pudo activar la suscripción: ${error.message}`);
    }
    updateControls();
});

notificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = notificationForm.elements.title.value.trim();
    const message = notificationForm.elements.message.value.trim();
    const adminToken = adminTokenInput.value;

    if (!title || !message || !adminToken) {
        setNotificationStatus("Completa el título, el mensaje y el secreto de administración.");
        return;
    }

    sendNotificationButton.disabled = true;
    try {
        const result = await readApiResponse(await fetch("/api/push/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ title, message })
        }));

        if (result.sent > 0) {
            const notifications = readNotifications();
            notifications.unshift({ title, message, sentAt: new Date().toISOString() });
            localStorage.setItem(notificationStorageKey, JSON.stringify(notifications.slice(0, 20)));
            renderNotifications();
        }
        adminTokenInput.value = "";
        if (result.total === 0) {
            setNotificationStatus("No hay dispositivos suscritos que puedan recibir el aviso.");
        } else {
            setNotificationStatus(`Recibida por ${result.sent} de ${result.total} dispositivo(s). Fallidas: ${result.failed}.`);
        }
    } catch (error) {
        console.error("No se pudo enviar la notificación push:", error);
        setNotificationStatus(`No se pudo enviar: ${error.message}`);
    } finally {
        adminTokenInput.value = "";
        updateControls();
    }
});

renderNotifications();
initialize();
