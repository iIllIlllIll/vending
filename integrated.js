import { Client, GatewayIntentBits, EmbedBuilder, Partials, ChannelType } from 'discord.js';
import sqlite3 from 'sqlite3';
import { Cultureland, CulturelandError, Pin } from 'cultureland.js';
import fs from 'fs/promises';

// 직접 환경 변수 선언
const TOKEN = '';
const CULTURELAND_ID = '';
const CULTURELAND_PASSWORD = '';
const CHANNEL_ID = '';
const LOG_CHANNEL_ID = '';

console.log("Bot Token:", TOKEN);  // 토큰 출력 디버그용
console.log("CULTURELAND_ID:", CULTURELAND_ID);
console.log("CULTURELAND_PASSWORD:", CULTURELAND_PASSWORD);
console.log("CHANNEL_ID:", CHANNEL_ID);
console.log("LOG_CHANNEL_ID:", LOG_CHANNEL_ID);

if (!TOKEN || typeof TOKEN !== 'string') {
  console.error('Invalid bot token.');
  process.exit(1);
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
];

const bot = new Client({
  intents,
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const db = new sqlite3.Database('database.db');

function logCharge(userId, amount) {
  const timestamp = new Date().toISOString();
  db.run(
    'INSERT INTO charge_logs (user_id, amount, timestamp) VALUES (?, ?, ?)',
    [userId, amount, timestamp]
  );
}

function logPurchase(userId, productName, productPrice) {
  const timestamp = new Date().toISOString();
  db.run(
    'INSERT INTO purchase_logs (user_id, product_name, product_price, timestamp) VALUES (?, ?, ?, ?)',
    [userId, productName, productPrice, timestamp]
  );
}

function getBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT balance FROM users WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          resolve(row.balance);
        } else {
          db.run(
            'INSERT INTO users (user_id, balance) VALUES (?, ?)',
            [userId, 0],
            () => resolve(0)
          );
        }
      }
    );
  });
}

function updateBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET balance = ? WHERE user_id = ?',
      [amount, userId],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function chargeCultureland(interaction, pin) {
  try {
    const client = new Cultureland();
    const login = await client.login(CULTURELAND_ID, CULTURELAND_PASSWORD);
    if (login instanceof CulturelandError) {
      await interaction.followUp({
        content: `로그인 실패: ${login.toString()}`,
        ephemeral: true
      });
      return;
    }

    const pinObj = new Pin(pin);
    const charge = await client.charge(pinObj);
    if (charge instanceof CulturelandError) {
      await interaction.followUp({
        content: `충전 실패: ${charge.toString()}`,
        ephemeral: true
      });
      return;
    }

    const amount = charge.amount;
    const userId = interaction.user.id;
    const currentBalance = await getBalance(userId);
    const newBalance = currentBalance + amount;
    await updateBalance(userId, newBalance);

    if (amount > 0) {
      logCharge(userId, amount);
      await interaction.followUp({
        content: `충전 성공: ${amount}원. 현재 잔액: ${newBalance}원`,
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: `충전 실패 : ${charge.message}`,
        ephemeral: true
      });
    }
  } catch (error) {
    await interaction.followUp({
      content: `서버 오류: ${error.message}`,
      ephemeral: true
    });
  }
}

bot.on('ready', async () => {
  console.log(`Logged in as ${bot.user.tag}`);
  const channel = await bot.channels.fetch(CHANNEL_ID);
  if (channel.type === ChannelType.GuildText) {
    const embed = new EmbedBuilder()
      .setTitle('자판기')
      .setDescription('충전 버튼을 눌러 핀번호를 입력하세요.');
    await channel.send({ embeds: [embed], components: [mainMenu] });
  }

  // 제품 목록과 역할 ID 출력
  try {
    const products = JSON.parse(await fs.readFile('products.json', 'utf-8'));
    products.forEach(product => {
      console.log(`Product: ${product.name}, Price: ${product.price}, Role ID: ${product.role_id}`);
    });
  } catch (error) {
    console.error('Failed to load products:', error);
  }
});

const mainMenu = {
  type: 1,
  components: [
    {
      type: 2,
      label: '충전',
      style: 1,
      custom_id: 'charge'
    },
    {
      type: 2,
      label: '정보',
      style: 2,
      custom_id: 'info'
    },
    {
      type: 2,
      label: '구매',
      style: 3,
      custom_id: 'buy'
    }
  ]
};

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const userBalance = await getBalance(userId);

  switch (interaction.customId) {
    case 'charge':
      await interaction.showModal({
        title: '컬쳐랜드 상품권 핀 번호 입력',
        custom_id: 'charge_modal',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'pin',
                label: '핀 번호',
                style: 1,
                min_length: 19,
                max_length: 21,
                required: true,
                placeholder: 'xxxx-xxxx-xxxx-xxxx 또는 xxxx-xxxx-xxxx-xxxxxx'
              }
            ]
          }
        ]
      });
      break;
    case 'info':
      await interaction.reply({
        content: `현재 잔액: ${userBalance}원`,
        ephemeral: true
      });
      break;
    case 'buy':
      const products = JSON.parse(await fs.readFile('products.json', 'utf-8'));
      const productOptions = products.map((product) => ({
        label: product.name,
        description: `가격: ${product.price}원`,
        value: product.name
      }));
      await interaction.reply({
        content: '구매할 제품을 선택하세요:',
        components: [
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: 'select_product',
                options: productOptions
              }
            ]
          }
        ],
        ephemeral: true
      });
      break;
    default:
      break;
  }
});

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'charge_modal') {
    const pin = interaction.fields.getTextInputValue('pin');
    await interaction.reply({
      content: '충전 중입니다. 잠시만 기다려주세요...',
      ephemeral: true
    });
    await chargeCultureland(interaction, pin);
  }
});

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'select_product') {
    const products = JSON.parse(await fs.readFile('products.json', 'utf-8'));
    const selectedProduct = interaction.values[0];
    const product = products.find((p) => p.name === selectedProduct);
    if (product) {
      await interaction.reply({
        content: `${product.name}를(을) 구매하시겠습니까? 가격: ${product.price}원`,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                label: '확인',
                style: 1,
                custom_id: `confirm_${product.name}`
              },
              {
                type: 2,
                label: '취소',
                style: 2,
                custom_id: 'cancel_purchase'
              }
            ]
          }
        ],
        ephemeral: true
      });
    }
  }
});

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, productName] = interaction.customId.split('_');

  if (action === 'confirm') {
    const products = JSON.parse(await fs.readFile('products.json', 'utf-8'));
    const product = products.find((p) => p.name === productName);
    const userId = interaction.user.id;
    const currentBalance = await getBalance(userId);

    if (currentBalance >= product.price) {
      const newBalance = currentBalance - product.price;
      await updateBalance(userId, newBalance);

      const role = interaction.guild.roles.cache.get(product.role_id);
      if (role) {
        try {
          await interaction.member.roles.add(role);
          await interaction.reply({
            content: `${product.name} 구매 완료! 남은 잔액: ${newBalance}원`,
            ephemeral: true
          });

          logPurchase(userId, product.name, product.price);

          const logChannel = await bot.channels.fetch(LOG_CHANNEL_ID);
          if (logChannel.type === ChannelType.GuildText) {
            const embed = new EmbedBuilder()
              .setTitle('구매 감사합니다!')
              .setDescription(
                `${interaction.user.username}님, ${product.name} 구매 감사합니다!`
              )
              .setColor('Green');
            await logChannel.send({ embeds: [embed] });
          }
        } catch (error) {
          console.error(`역할 지급 실패: ${error.message}`);
          await interaction.reply({
            content: `역할 지급 중 오류가 발생했습니다. 관리자에게 문의하세요.\n오류: ${error.message}`,
            ephemeral: true
          });
        }
      } else {
        console.error(`역할을 찾을 수 없음: Role ID ${product.role_id}`);
        await interaction.reply({
          content: `역할을 찾을 수 없습니다. 관리자에게 문의하세요.\nRole ID: ${product.role_id}`,
          ephemeral: true
        });
      }
    } else {
      await interaction.reply({
        content: '잔액이 부족합니다.',
        ephemeral: true
      });
    }
  } else if (action === 'cancel') {
    await interaction.reply({
      content: '구매가 취소되었습니다.',
      ephemeral: true
    });
  }
});

bot.login(TOKEN);
