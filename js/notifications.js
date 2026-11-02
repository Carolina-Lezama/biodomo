const enableNotificationsButton = document.getElementById("enable-notifications");
const notificationForm = document.getElementById("notification-form");
const notificationStatus = document.getElementById("notification-status");
const notificationList = document.getElementById("notification-list");
const sendNotificationButton = document.getElementById("send-notification");
const notificationStorageKey = "biodomo-notifications";

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

function updateNotificationControls() {
    const supported = "Notification" in window
        && "serviceWorker" in navigator
        && window.isSecureContext;

    if (!supported) {
        enableNotificationsButton.disabled = true;
        sendNotificationButton.disabled = true;
        setNotificationStatus("Las notificaciones requieren un navegador compatible y HTTPS o localhost.");
        return;
    }

    if (Notification.permission === "granted") {
        enableNotificationsButton.hidden = true;
        sendNotificationButton.disabled = false;
        setNotificationStatus("Notificaciones activadas en este dispositivo.");
    } else if (Notification.permission === "denied") {
        enableNotificationsButton.disabled = true;
        sendNotificationButton.disabled = true;
        setNotificationStatus("El permiso está bloqueado. Puedes cambiarlo en la configuración del navegador.");
    } else {
        sendNotificationButton.disabled = true;
        setNotificationStatus("Activa las notificaciones para comenzar.");
    }
}

enableNotificationsButton.addEventListener("click", async () => {
    try {
        const permission = await Notification.requestPermission();
        updateNotificationControls();
        if (permission !== "granted") {
            setNotificationStatus("No se concedió permiso para mostrar notificaciones.");
        }
    } catch (error) {
        console.error("No se pudo solicitar permiso para notificaciones:", error);
        setNotificationStatus("No se pudo solicitar el permiso. Revisa la consola del navegador.");
    }
});

notificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (Notification.permission !== "granted") {
        updateNotificationControls();
        return;
    }

    const title = notificationForm.elements.title.value.trim();
    const message = notificationForm.elements.message.value.trim();
    if (!title || !message) {
        setNotificationStatus("Escribe un título y un mensaje antes de enviar.");
        return;
    }

    sendNotificationButton.disabled = true;
    try {
        const registration = await navigator.serviceWorker.ready;
        const sentAt = new Date().toISOString();
        await registration.showNotification(title, {
            body: message,
            icon: "./assets/pwa-icons/icon-192.png",
            badge: "./assets/pwa-icons/icon-192.png",
            data: { url: "./#notificaciones" }
        });

        const notifications = readNotifications();
        notifications.unshift({ title, message, sentAt });
        localStorage.setItem(notificationStorageKey, JSON.stringify(notifications.slice(0, 20)));
        renderNotifications();
        setNotificationStatus("Notificación enviada a este dispositivo.");
    } catch (error) {
        console.error("No se pudo mostrar la notificación:", error);
        setNotificationStatus("No se pudo enviar la notificación. Revisa la consola del navegador.");
    } finally {
        updateNotificationControls();
    }
});

renderNotifications();
updateNotificationControls();
