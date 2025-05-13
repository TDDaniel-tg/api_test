// Импорт необходимых модулей
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Настройки сервера
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret'; // Секретный ключ для проверки вебхуков
const LOG_DIR = path.join(__dirname, 'logs');

// Создаем папку для логов, если её нет
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Создаем лог-файл для хранения всех вебхуков
const webhookLogFile = path.join(LOG_DIR, 'webhooks.log');

// Инициализация Express приложения
const app = express();
const server = http.createServer(app);

// Инициализация WebSocket сервера
const wss = new WebSocket.Server({ server });

// Middleware для разбора JSON
app.use(bodyParser.json());

// Обслуживание статических файлов
app.use(express.static(__dirname));

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'webhook-receiver.html'));
});

// Маршрут для API документации
app.get('/api', (req, res) => {
    res.json({
        description: 'API для приема вебхуков от ЮKassa',
        endpoints: [
            {
                path: '/api/webhook',
                method: 'POST',
                description: 'Основной эндпоинт для приема вебхуков от ЮKassa'
            },
            {
                path: '/api/test-webhook',
                method: 'POST',
                description: 'Тестовый эндпоинт для отправки тестовых вебхуков'
            }
        ]
    });
});

// Маршрут для приема вебхуков от ЮKassa
app.post('/api/webhook', (req, res) => {
    try {
        console.log('Получен вебхук:', req.method, req.url);
        console.log('Тело запроса:', JSON.stringify(req.body, null, 2));
        console.log('Заголовки:', req.headers);

        // Получаем заголовок с подписью
        const signature = req.headers['content-signature'] || req.headers['signature'];
        
        // Если есть подпись, проверяем её
        if (signature) {
            const isValid = verifySignature(req.body, signature);
            if (!isValid) {
                console.warn('Недействительная подпись вебхука');
                return res.status(401).json({ error: 'Недействительная подпись' });
            }
        }
        
        // Логируем вебхук в файл
        logWebhook(req.body);
        
        // Отправляем вебхук всем подключенным клиентам
        broadcastWebhook(req.body);
        
        // Отправляем успешный ответ
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Ошибка при обработке вебхука:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Маршрут для тестовых вебхуков
app.post('/api/test-webhook', (req, res) => {
    try {
        // Создаем тестовое уведомление, если не передано тело запроса
        const testEvent = req.body || createTestWebhook();
        
        // Добавляем метку, что это тестовый вебхук
        testEvent.test = true;
        
        // Логируем тестовый вебхук
        logWebhook(testEvent);
        
        // Отправляем тестовый вебхук всем подключенным клиентам
        broadcastWebhook(testEvent);
        
        // Отправляем успешный ответ с данными тестового вебхука
        res.status(200).json({ 
            status: 'ok',
            message: 'Тестовый вебхук отправлен',
            webhook: testEvent
        });
    } catch (error) {
        console.error('Ошибка при отправке тестового вебхука:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Функция проверки подписи вебхука
function verifySignature(payload, signature) {
    try {
        // Извлекаем алгоритм и значение подписи
        const [algorithm, hash] = signature.split('=');
        
        // Проверяем, что алгоритм sha256
        if (algorithm !== 'sha256') {
            console.warn('Неподдерживаемый алгоритм подписи:', algorithm);
            return false;
        }
        
        // Создаем HMAC
        const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
        hmac.update(JSON.stringify(payload));
        const expectedHash = hmac.digest('hex');
        
        // Сравниваем хэши
        return crypto.timingSafeEqual(
            Buffer.from(hash),
            Buffer.from(expectedHash)
        );
    } catch (error) {
        console.error('Ошибка при проверке подписи:', error);
        return false;
    }
}

// Функция записи вебхука в лог
function logWebhook(webhook) {
    try {
        // Добавляем временную метку
        const logEntry = {
            timestamp: new Date().toISOString(),
            webhook: webhook
        };
        
        // Записываем в файл
        fs.appendFileSync(
            webhookLogFile,
            JSON.stringify(logEntry) + '\n',
            { encoding: 'utf8' }
        );
    } catch (error) {
        console.error('Ошибка при записи вебхука в лог:', error);
    }
}

// Функция отправки вебхука всем подключенным клиентам
function broadcastWebhook(webhook) {
    const message = JSON.stringify(webhook);
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Создание тестового вебхука
function createTestWebhook() {
    // Генерируем случайный ID
    const id = crypto.randomBytes(8).toString('hex');
    
    // Случайная сумма от 100 до 10000
    const amount = Math.floor(Math.random() * 9900) + 100;
    
    // Случайный статус
    const statuses = ['pending', 'waiting_for_capture', 'succeeded', 'canceled'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    // Формируем уведомление
    const event = status === 'succeeded' ? 'payment.succeeded' : 
                  status === 'canceled' ? 'payment.canceled' : 
                  'payment.waiting_for_capture';
    
    return {
        event: event,
        object: {
            id: id,
            status: status,
            amount: {
                value: amount.toFixed(2),
                currency: 'RUB'
            },
            created_at: new Date().toISOString(),
            description: 'Тестовый платеж',
            test: true,
            paid: status === 'succeeded',
            refundable: status === 'succeeded',
            metadata: {
                order_id: `test_${Math.floor(Math.random() * 10000)}`
            }
        }
    };
}

// Обработка WebSocket подключений
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`Новое WebSocket подключение с ${ip}`);
    
    // Отправляем сообщение о успешном подключении
    ws.send(JSON.stringify({
        event: 'connection',
        message: 'Подключение установлено',
        timestamp: new Date().toISOString()
    }));
    
    // Обработка сообщений от клиента
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Получено сообщение от клиента:', data);
            
            // Здесь можно обрабатывать команды от клиента
            if (data.command === 'ping') {
                ws.send(JSON.stringify({
                    event: 'pong',
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error('Ошибка при обработке сообщения от клиента:', error);
        }
    });
    
    // Обработка закрытия соединения
    ws.on('close', () => {
        console.log(`WebSocket соединение с ${ip} закрыто`);
    });
    
    // Обработка ошибок
    ws.on('error', (error) => {
        console.error(`Ошибка WebSocket соединения с ${ip}:`, error);
    });
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер мониторинга вебхуков запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
    console.log(`URL для вебхуков: http://localhost:${PORT}/api/webhook`);
}); 