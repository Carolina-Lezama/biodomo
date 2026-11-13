const gardenConnectForm = document.getElementById("garden-connect-form");
const gardenPlantForm = document.getElementById("garden-plant-form");
const gardenReadingForm = document.getElementById("garden-reading-form");
const gardenEventForm = document.getElementById("garden-event-form");
const gardenStatus = document.getElementById("garden-status");
const gardenEventStatus = document.getElementById("garden-event-status");
const gardenPlantList = document.getElementById("garden-plant-list");
const gardenReadingList = document.getElementById("garden-reading-list");
const gardenReadingPlant = document.getElementById("garden-reading-plant");
const gardenEventPlant = document.getElementById("garden-event-plant");
const gardenEventDate = document.getElementById("garden-event-date");
const gardenEventList = document.getElementById("garden-event-list");
const gardenAdminSecretInput = document.getElementById("garden-admin-secret");
const gardenStatusLabels = {
    germinacion: "Germinación",
    crecimiento: "Crecimiento",
    cosecha: "Cosecha"
};
const gardenEventLabels = {
    siembra: "Siembra",
    trasplante: "Trasplante",
    fertilizacion: "Fertilización",
    poda: "Poda",
    cosecha: "Cosecha",
    otro: "Otra actividad"
};

let gardenAdminSecret = "";
let gardenConnected = false;
let gardenPlants = [];

function setGardenStatus(message) {
    gardenStatus.textContent = message;
}

function setGardenEventStatus(message) {
    gardenEventStatus.textContent = message;
}

function setGardenEventDateToNow() {
    const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    gardenEventDate.value = localDate.toISOString().slice(0, 16);
}

async function readGardenResponse(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || `El servidor respondió ${response.status}.`);
    }
    return result;
}

async function gardenRequest(url, options = {}) {
    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${gardenAdminSecret}`
    };
    return readGardenResponse(await fetch(url, { ...options, headers, cache: "no-store" }));
}

function addTextElement(parent, tagName, text, className) {
    const element = document.createElement(tagName);
    element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
}

function renderGardenPlants() {
    gardenPlantList.replaceChildren();
    if (gardenPlants.length === 0) {
        addTextElement(gardenPlantList, "li", "Todavía no hay plantas registradas.");
        return;
    }

    gardenPlants.forEach((plant) => {
        const item = document.createElement("li");
        item.dataset.plantId = plant.id;
        addTextElement(item, "strong", plant.name);
        addTextElement(item, "p", `${plant.species} · ${plant.location}`);
        addTextElement(item, "p", `Etapa: ${gardenStatusLabels[plant.status]}`);
        if (plant.wateredAt) {
            addTextElement(item, "p", `Último riego: ${new Date(plant.wateredAt).toLocaleString()}`);
        }

        const actions = document.createElement("div");
        actions.className = "garden-plant-actions";
        const label = document.createElement("label");
        label.textContent = "Etapa";
        const statusSelect = document.createElement("select");
        statusSelect.dataset.action = "select-status";
        Object.entries(gardenStatusLabels).forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = plant.status === value;
            statusSelect.append(option);
        });
        label.append(statusSelect);
        actions.append(label);

        const updateButton = document.createElement("button");
        updateButton.type = "button";
        updateButton.dataset.action = "update-status";
        updateButton.textContent = "Actualizar etapa";
        actions.append(updateButton);

        const waterButton = document.createElement("button");
        waterButton.type = "button";
        waterButton.dataset.action = "water";
        waterButton.textContent = "Registrar riego";
        actions.append(waterButton);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";
        deleteButton.textContent = "Eliminar";
        actions.append(deleteButton);
        item.append(actions);
        gardenPlantList.append(item);
    });
}

function renderGardenReadings(readings) {
    gardenReadingList.replaceChildren();
    if (readings.length === 0) {
        addTextElement(gardenReadingList, "li", "No hay mediciones para esta planta.");
        return;
    }

    readings.forEach((reading) => {
        const item = document.createElement("li");
        addTextElement(item, "strong", `${reading.temperatureC} °C · ${reading.humidity}% humedad`);
        addTextElement(item, "p", `pH ${reading.ph} · ${reading.lightLux} lux`);
        const time = addTextElement(item, "time", new Date(reading.recordedAt).toLocaleString());
        time.dateTime = reading.recordedAt;
        gardenReadingList.append(item);
    });
}

function renderGardenEvents(events) {
    gardenEventList.replaceChildren();
    if (events.length === 0) {
        addTextElement(gardenEventList, "li", "Todavía no hay actividades registradas.");
        return;
    }

    events.forEach((event) => {
        const item = document.createElement("li");
        addTextElement(item, "strong", gardenEventLabels[event.eventType] || "Actividad");
        addTextElement(item, "p", `Planta: ${event.plantName}`);
        addTextElement(item, "p", event.note);
        const time = addTextElement(item, "time", new Date(event.occurredAt).toLocaleString());
        time.dateTime = event.occurredAt;
        gardenEventList.append(item);
    });
}

async function loadGardenEvents() {
    const result = await gardenRequest("/api/garden/events");
    renderGardenEvents(result.events);
    setGardenEventStatus(`${result.events.length} actividad(es) reciente(s).`);
}

async function loadGardenReadings() {
    const plantId = gardenReadingPlant.value;
    if (!gardenConnected || !plantId) {
        renderGardenReadings([]);
        return;
    }
    const result = await gardenRequest(`/api/garden/readings?plantId=${encodeURIComponent(plantId)}`);
    renderGardenReadings(result.readings);
}

async function loadGardenPlants() {
    const selectedPlantId = gardenReadingPlant.value;
    const result = await gardenRequest("/api/garden/plants");
    gardenPlants = result.plants;
    renderGardenPlants();

    gardenReadingPlant.replaceChildren();
    gardenPlants.forEach((plant) => {
        const option = document.createElement("option");
        option.value = plant.id;
        option.textContent = plant.name;
        gardenReadingPlant.append(option);
    });
    gardenEventPlant.replaceChildren();
    gardenPlants.forEach((plant) => {
        const option = document.createElement("option");
        option.value = plant.id;
        option.textContent = plant.name;
        gardenEventPlant.append(option);
    });
    if (gardenPlants.some((plant) => plant.id === selectedPlantId)) {
        gardenReadingPlant.value = selectedPlantId;
    }

    gardenConnected = true;
    gardenPlantForm.hidden = false;
    gardenReadingForm.hidden = gardenPlants.length === 0;
    gardenEventForm.hidden = gardenPlants.length === 0;
    if (!gardenEventDate.value) {
        setGardenEventDateToNow();
    }
    if (gardenPlants.length === 0) {
        gardenReadingList.replaceChildren();
        addTextElement(gardenReadingList, "li", "Agrega una planta para registrar mediciones.");
        gardenEventList.replaceChildren();
        addTextElement(gardenEventList, "li", "Agrega una planta antes de iniciar la bitácora.");
        setGardenEventStatus("La bitácora está lista cuando registres una planta.");
    } else {
        await loadGardenReadings();
        await loadGardenEvents();
    }
}

gardenConnectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    gardenAdminSecret = gardenAdminSecretInput.value;
    setGardenStatus("Conectando con el backend...");
    try {
        await loadGardenPlants();
        gardenAdminSecretInput.value = "";
        gardenAdminSecretInput.disabled = true;
        gardenConnectForm.querySelector('button[type="submit"]').disabled = true;
        setGardenStatus(`Conectado. ${gardenPlants.length} planta(s) sincronizada(s).`);
    } catch (error) {
        gardenAdminSecret = "";
        gardenConnected = false;
        gardenAdminSecretInput.value = "";
        gardenAdminSecretInput.disabled = false;
        gardenConnectForm.querySelector('button[type="submit"]').disabled = false;
        gardenPlantForm.hidden = true;
        gardenReadingForm.hidden = true;
        gardenEventForm.hidden = true;
        console.error("No se pudo conectar con el backend del huerto:", error);
        setGardenStatus(`No se pudo conectar: ${error.message}`);
    }
});

gardenPlantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(gardenPlantForm);
    try {
        await gardenRequest("/api/garden/plants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: formData.get("name"),
                species: formData.get("species"),
                location: formData.get("location")
            })
        });
        gardenPlantForm.reset();
        await loadGardenPlants();
        setGardenStatus("Planta guardada correctamente.");
    } catch (error) {
        console.error("No se pudo guardar la planta:", error);
        setGardenStatus(`No se pudo guardar la planta: ${error.message}`);
    }
});

gardenPlantList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const plantItem = button.closest("[data-plant-id]");
    const plantId = plantItem.dataset.plantId;
    const action = button.dataset.action;

    if (action === "delete" && !window.confirm("¿Eliminar esta planta y sus mediciones?")) {
        return;
    }

    try {
        if (action === "delete") {
            await gardenRequest(`/api/garden/plants?id=${encodeURIComponent(plantId)}`, { method: "DELETE" });
        } else if (action === "water") {
            await gardenRequest(`/api/garden/plants?id=${encodeURIComponent(plantId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wateredNow: true })
            });
        } else if (action === "update-status") {
            const status = plantItem.querySelector('[data-action="select-status"]').value;
            await gardenRequest(`/api/garden/plants?id=${encodeURIComponent(plantId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status })
            });
        }
        await loadGardenPlants();
        setGardenStatus("Cambios guardados y sincronizados.");
    } catch (error) {
        console.error("No se pudo actualizar la planta:", error);
        setGardenStatus(`No se pudo actualizar la planta: ${error.message}`);
    }
});

gardenReadingPlant.addEventListener("change", async () => {
    try {
        await loadGardenReadings();
    } catch (error) {
        console.error("No se pudieron consultar las mediciones:", error);
        setGardenStatus(`No se pudieron consultar las mediciones: ${error.message}`);
    }
});

gardenReadingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(gardenReadingForm);
    try {
        await gardenRequest("/api/garden/readings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                plantId: formData.get("plantId"),
                temperatureC: Number(formData.get("temperatureC")),
                humidity: Number(formData.get("humidity")),
                ph: Number(formData.get("ph")),
                lightLux: Number(formData.get("lightLux"))
            })
        });
        const selectedPlantId = formData.get("plantId");
        gardenReadingForm.reset();
        gardenReadingPlant.value = selectedPlantId;
        await loadGardenReadings();
        setGardenStatus("Medición guardada correctamente.");
    } catch (error) {
        console.error("No se pudo guardar la medición:", error);
        setGardenStatus(`No se pudo guardar la medición: ${error.message}`);
    }
});

gardenEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(gardenEventForm);
    try {
        await gardenRequest("/api/garden/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                plantId: formData.get("plantId"),
                eventType: formData.get("eventType"),
                note: formData.get("note"),
                occurredAt: new Date(formData.get("occurredAt")).toISOString()
            })
        });
        const selectedPlantId = formData.get("plantId");
        gardenEventForm.reset();
        gardenEventPlant.value = selectedPlantId;
        setGardenEventDateToNow();
        await loadGardenEvents();
        setGardenEventStatus("Actividad guardada en la bitácora.");
    } catch (error) {
        console.error("No se pudo guardar la actividad de cultivo:", error);
        setGardenEventStatus(`No se pudo guardar la actividad: ${error.message}`);
    }
});
