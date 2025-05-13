// Конфигурация
const CONFIG = {
    apiEndpoint: '/api/webhook', // API эндпоинт для вебхуков
    wsEndpoint: 'ws://' + window.location.hostname + (window.location.port ? ':' + window.location.port : '') + '/ws', // WebSocket эндпоинт
    maxWebhooks: 50, // Максимальное количество хранимых уведомлений
    reconnectInterval: 5000 // Интервал переподключения WebSocket в мс
};

// Глобальные переменные
let webhooks = []; // Массив полученных уведомлений
let socket = null; // WebSocket соединение
let isConnected = false; // Статус подключения
let reconnectTimer = null; // Таймер переподключения

// DOM элементы
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    statusDot: document.querySelector('.status-dot'),
    statusText: document.querySelector('.status-text'),
    webhooksList: document.getElementById('webhooksList'),
    webhookUrl: document.getElementById('webhookUrl'),
    clearButton: document.getElementById('clearButton'),
    copyButton: document.getElementById('copyButton'),
    eventFilter: document.getElementById('eventFilter'),
    detailsPanel: document.getElementById('detailsPanel'),
    closeDetails: document.getElementById('closeDetails'),
    webhookDetails: document.getElementById('webhookDetails'),
    copyDetailsButton: document.getElementById('copyDetailsButton'),
    webhookTemplate: document.getElementById('webhookItemTemplate')
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    // Отображаем URL вебхука
    updateWebhookUrl();

    // Подключаемся к WebSocket
    connectWebSocket();

    // Обработчики событий
    setupEventListeners();

    // Загружаем сохраненные уведомления из localStorage
    loadSavedWebhooks();
});

// Загрузка сохраненных уведомлений
function loadSavedWebhooks() {
    try {
        const savedWebhooks = localStorage.getItem('webhooks');
        if (savedWebhooks) {
            webhooks = JSON.parse(savedWebhooks);
            renderWebhooks();
        }
    } catch (error) {
        console.error('Ошибка при загрузке сохраненных уведомлений:', error);
    }
}

// Обновление отображаемого URL вебхука
function updateWebhookUrl() {
    const fullUrl = window.location.origin + CONFIG.apiEndpoint;
    elements.webhookUrl.textContent = fullUrl;
}

// Подключение к WebSocket
function connectWebSocket() {
    try {
        // Закрываем предыдущее соединение, если оно было
        if (socket) {
            socket.close();
        }

        // Создаем новое соединение
        socket = new WebSocket(CONFIG.wsEndpoint);

        // Обработчики WebSocket
        socket.onopen = handleSocketOpen;
        socket.onmessage = handleSocketMessage;
        socket.onclose = handleSocketClose;
        socket.onerror = handleSocketError;

    } catch (error) {
        console.error('Ошибка при подключении к WebSocket:', error);
        setConnectionStatus(false, 'Ошибка подключения');
        scheduleReconnect();
    }
}

// Обработчик открытия соединения
function handleSocketOpen() {
    console.log('WebSocket подключен');
    setConnectionStatus(true, 'Соединение установлено');
    clearReconnectTimer();
}

// Обработчик входящих сообщений
function handleSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('Получено новое уведомление:', data);
        
        // Добавляем уведомление в начало массива
        data.receivedAt = new Date().toISOString();
        webhooks.unshift(data);
        
        // Ограничиваем количество хранимых уведомлений
        if (webhooks.length > CONFIG.maxWebhooks) {
            webhooks = webhooks.slice(0, CONFIG.maxWebhooks);
        }
        
        // Сохраняем в localStorage
        saveWebhooks();
        
        // Обновляем список уведомлений
        renderWebhooks();
        
        // Показываем уведомление
        showNotification('Новое уведомление', `Получено уведомление типа ${data.event}`);
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
    }
}

// Обработчик закрытия соединения
function handleSocketClose(event) {
    console.log('WebSocket соединение закрыто:', event.code, event.reason);
    setConnectionStatus(false, 'Соединение разорвано');
    scheduleReconnect();
}

// Обработчик ошибок соединения
function handleSocketError(error) {
    console.error('Ошибка WebSocket:', error);
    setConnectionStatus(false, 'Ошибка соединения');
}

// Установка статуса подключения
function setConnectionStatus(connected, message) {
    isConnected = connected;
    
    // Обновляем индикатор статуса
    elements.statusDot.className = 'status-dot ' + (connected ? 'online' : 'offline');
    elements.statusText.textContent = message || (connected ? 'Подключено' : 'Не подключено');
    
    // Обновляем класс для панели статуса
    elements.connectionStatus.className = 'status-indicator ' + (connected ? 'connected' : 'disconnected');
}

// Планирование переподключения
function scheduleReconnect() {
    if (!reconnectTimer) {
        console.log(`Переподключение через ${CONFIG.reconnectInterval / 1000} секунд...`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectWebSocket();
        }, CONFIG.reconnectInterval);
    }
}

// Отмена запланированного переподключения
function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

// Сохранение уведомлений в localStorage
function saveWebhooks() {
    try {
        localStorage.setItem('webhooks', JSON.stringify(webhooks));
    } catch (error) {
        console.error('Ошибка при сохранении уведомлений:', error);
    }
}

// Отображение уведомлений в списке
function renderWebhooks() {
    // Получаем текущий фильтр
    const filterValue = elements.eventFilter.value;
    
    // Фильтруем уведомления
    const filteredWebhooks = filterValue === 'all' 
        ? webhooks 
        : webhooks.filter(webhook => webhook.event === filterValue);
    
    // Очищаем список
    elements.webhooksList.innerHTML = '';
    
    // Если нет уведомлений, показываем пустое состояние
    if (filteredWebhooks.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <img src="https://yookassa.ru/favicon.ico" alt="ЮKassa Logo" width="64" height="64">
            <p>${webhooks.length > 0 ? 'Нет уведомлений, соответствующих фильтру' : 'Ожидание уведомлений...'}</p>
            <p class="hint">Настройте вебхуки в личном кабинете ЮKassa на URL:</p>
            <code>${window.location.origin}${CONFIG.apiEndpoint}</code>
        `;
        elements.webhooksList.appendChild(emptyState);
        return;
    }
    
    // Добавляем уведомления в список
    filteredWebhooks.forEach(webhook => {
        const webhookItem = createWebhookItem(webhook);
        elements.webhooksList.appendChild(webhookItem);
    });
}

// Создание элемента уведомления
function createWebhookItem(webhook) {
    // Клонируем шаблон
    const template = elements.webhookTemplate.cloneNode(true);
    const webhookItem = template.querySelector('.webhook-item');
    
    // Заполняем данными
    const eventType = webhookItem.querySelector('.event-type');
    const timestamp = webhookItem.querySelector('.timestamp');
    const paymentId = webhookItem.querySelector('.payment-id');
    const paymentAmount = webhookItem.querySelector('.payment-amount');
    const paymentStatus = webhookItem.querySelector('.payment-status');
    const viewDetailsBtn = webhookItem.querySelector('.view-details-btn');
    
    // Тип события
    eventType.textContent = webhook.event || 'Неизвестное событие';
    
    // Время получения
    const date = new Date(webhook.receivedAt);
    timestamp.textContent = formatDate(date);
    
    // ID платежа
    if (webhook.object && webhook.object.id) {
        paymentId.textContent = `ID: ${webhook.object.id}`;
    } else {
        paymentId.textContent = 'ID: не указан';
    }
    
    // Сумма платежа
    if (webhook.object && webhook.object.amount) {
        const amount = webhook.object.amount.value;
        const currency = webhook.object.amount.currency;
        paymentAmount.textContent = `${amount} ${formatCurrency(currency)}`;
    } else {
        paymentAmount.textContent = 'Сумма не указана';
    }
    
    // Статус платежа
    if (webhook.object && webhook.object.status) {
        const status = webhook.object.status;
        paymentStatus.textContent = translateStatus(status);
        paymentStatus.className = 'payment-status status-' + status;
    } else {
        paymentStatus.textContent = 'Статус не указан';
        paymentStatus.className = 'payment-status';
    }
    
    // Обработчик для кнопки "Подробнее"
    viewDetailsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвращаем всплытие события
        showWebhookDetails(webhook);
    });
    
    // Обработчик для всей карточки
    webhookItem.addEventListener('click', () => {
        showWebhookDetails(webhook);
    });
    
    return webhookItem;
}

// Показ детальной информации об уведомлении
function showWebhookDetails(webhook) {
    // Форматируем JSON для отображения
    const formattedJson = JSON.stringify(webhook, null, 2);
    
    // Отображаем данные
    elements.webhookDetails.textContent = formattedJson;
    
    // Открываем панель деталей
    elements.detailsPanel.classList.add('open');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Закрытие панели деталей
    elements.closeDetails.addEventListener('click', () => {
        elements.detailsPanel.classList.remove('open');
    });
    
    // Копирование JSON в буфер обмена
    elements.copyDetailsButton.addEventListener('click', () => {
        const text = elements.webhookDetails.textContent;
        copyToClipboard(text);
        showNotification('Скопировано', 'JSON скопирован в буфер обмена');
    });
    
    // Копирование URL вебхука
    elements.copyButton.addEventListener('click', () => {
        const url = elements.webhookUrl.textContent;
        copyToClipboard(url);
        showNotification('Скопировано', 'URL скопирован в буфер обмена');
    });
    
    // Очистка списка уведомлений
    elements.clearButton.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите удалить все уведомления?')) {
            webhooks = [];
            saveWebhooks();
            renderWebhooks();
            showNotification('Очищено', 'Все уведомления удалены');
        }
    });
    
    // Фильтрация уведомлений
    elements.eventFilter.addEventListener('change', () => {
        renderWebhooks();
    });
    
    // Закрытие панели деталей при клике вне её
    document.addEventListener('click', (e) => {
        if (elements.detailsPanel.classList.contains('open') && 
            !elements.detailsPanel.contains(e.target)) {
            elements.detailsPanel.classList.remove('open');
        }
    });
    
    // Обработка клавиши Escape для закрытия панели деталей
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.detailsPanel.classList.contains('open')) {
            elements.detailsPanel.classList.remove('open');
        }
    });
}

// Копирование текста в буфер обмена
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Ошибка при копировании в буфер обмена:', err);
        
        // Запасной вариант для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}

// Показ браузерного уведомления
function showNotification(title, message) {
    // Проверяем поддержку и разрешения
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body: message });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body: message });
                }
            });
        }
    }
    
    // Также показываем в консоли
    console.log(`${title}: ${message}`);
}

// Вспомогательные функции

// Форматирование даты
function formatDate(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Форматирование валюты
function formatCurrency(currency) {
    switch (currency.toLowerCase()) {
        case 'rub':
            return '₽';
        case 'usd':
            return '$';
        case 'eur':
            return '€';
        default:
            return currency;
    }
}

// Перевод статуса на русский
function translateStatus(status) {
    const statuses = {
        'pending': 'Ожидает оплаты',
        'waiting_for_capture': 'Ожидает подтверждения',
        'succeeded': 'Успешно',
        'canceled': 'Отменен',
        'refunded': 'Возвращен'
    };
    
    return statuses[status] || status;
} 