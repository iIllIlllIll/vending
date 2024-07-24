const express = require('express');
const bodyParser = require('body-parser');
const { Cultureland } = require('cultureland.js');
const Pin = require('cultureland.js/src/Pin');

const app = express();
app.use(bodyParser.json());

app.post('/charge', async (req, res) => {
    const { id, password, pin } = req.body;

    try {
        const client = new Cultureland();
        await client.login(id, password);

        const result = await client.charge(new Pin(pin));
        res.json({ success: true, amount: result.amount, message: result.message });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
