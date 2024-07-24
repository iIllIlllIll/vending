import express from 'express';
import bodyParser from 'body-parser';
import Cultureland, { CulturelandError, Pin } from 'cultureland.js';

const app = express();
const port = 3000;

// Body parser middleware
app.use(bodyParser.json());

app.post('/charge', async (req, res) => {
    console.log('Received POST request on /charge');
    console.log('Request body:', req.body);
    
    const { id, password, pin } = req.body;

    if (!id || !password || !pin) {
        return res.status(400).json({ success: false, message: 'ID, password and pin are required.' });
    }

    try {
        // 클라이언트 선언
        const client = new Cultureland();

        // ID, 비밀번호로 로그인
        const login = await client.login(id, password);
        if (login instanceof CulturelandError) {
            return res.status(400).json({ success: false, message: login.toString() });
        }

        // 핀번호 선언
        const pinObj = new Pin(pin);

        // 상품권 충전
        const charge = await client.charge(pinObj);
        if (charge instanceof CulturelandError) {
            return res.status(400).json({ success: false, message: charge.toString() });
        }

        // 충전 결과 반환
        return res.json({ success: true, amount: charge.amount, message: charge.message });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
