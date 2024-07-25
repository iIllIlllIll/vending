import discord
from discord.ext import commands, tasks
import requests
import json
import sqlite3

# 설정 파일 로드
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

TOKEN = config['token']
CULTURELAND_ID = config['cultureland_id']
CULTURELAND_PASSWORD = config['cultureland_password']
CHANNEL_ID = int(config['channel_id'])
SERVER_URL = config['server_url']  # Node.js 서버 URL
LOG_CHANNEL_ID = int(config['log_channel_id'])

# 제품 목록 로드
with open('products.json', 'r', encoding='utf-8') as f:
    PRODUCTS = json.load(f)

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix='!', intents=intents)

import datetime

def log_charge(user_id, amount):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    timestamp = datetime.datetime.now().isoformat()
    cursor.execute('INSERT INTO charge_logs (user_id, amount, timestamp) VALUES (?, ?, ?)', (user_id, amount, timestamp))
    conn.commit()
    conn.close()

def log_purchase(user_id, product_name, product_price):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    timestamp = datetime.datetime.now().isoformat()
    cursor.execute('INSERT INTO purchase_logs (user_id, product_name, product_price, timestamp) VALUES (?, ?, ?, ?)', (user_id, product_name, product_price, timestamp))
    conn.commit()
    conn.close()


def get_balance(user_id):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('SELECT balance FROM users WHERE user_id = ?', (user_id,))
    result = cursor.fetchone()
    if result is None:
        cursor.execute('INSERT INTO users (user_id, balance) VALUES (?, ?)', (user_id, 0))
        conn.commit()
        balance = 0
    else:
        balance = result[0]
    conn.close()
    return balance

def update_balance(user_id, amount):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('SELECT balance FROM users WHERE user_id = ?', (user_id,))
    result = cursor.fetchone()
    if result is None:
        cursor.execute('INSERT INTO users (user_id, balance) VALUES (?, ?)', (user_id, 0))
    else:
        cursor.execute('UPDATE users SET balance = ? WHERE user_id = ?', (amount, user_id))
    conn.commit()
    conn.close()

class ChargeModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="컬쳐랜드 상품권 핀 번호 입력")

        self.pin = discord.ui.TextInput(
            label="핀 번호",
            placeholder="xxxx-xxxx-xxxx-xxxx 또는 xxxx-xxxx-xxxx-xxxxxx",
            required=True,
            max_length=21,
            min_length=19
        )
        self.add_item(self.pin)

    async def on_submit(self, interaction: discord.Interaction):
        pin = self.pin.value
        pin_parts = pin.split('-')
        if len(pin_parts) == 4 and all(len(part) == 4 for part in pin_parts):
            await charge_cultureland(interaction, pin)
        else:
            if len(pin_parts[3]) == 6:
                await charge_cultureland(interaction, pin)
            else:
                await interaction.response.send_message("잘못된 핀 번호 형식입니다.", ephemeral=True)

async def charge_cultureland(interaction, pin):
    await interaction.response.send_message("충전 중입니다. 잠시만 기다려주세요...", ephemeral=True)
    data = {
        'id': CULTURELAND_ID,
        'password': CULTURELAND_PASSWORD,
        'pin': pin
    }
    try:
        response = requests.post(SERVER_URL + "/charge", json=data)
        response.raise_for_status()
        result = response.json()
    except requests.RequestException as e:
        await interaction.followup.send(f"서버 오류: {e}", ephemeral=True)
        return
    except json.JSONDecodeError:
        await interaction.followup.send("잘못된 서버 응답입니다.", ephemeral=True)
        return

    if result['success']:
        amount = result['amount']
        user_id = str(interaction.user.id)
        current_balance = get_balance(user_id)
        new_balance = current_balance + result['amount']
        update_balance(user_id, new_balance)
        if result['amount'] > 0:
            log_charge(user_id, amount)  # 충전 기록 추가
            await interaction.followup.send(f"충전 성공: {result['amount']}원. 현재 잔액: {new_balance}원", ephemeral=True)
            return
        else:
            await interaction.followup.send(f"충전 실패 : {result['message']}", ephemeral=True)
            return
    else:
        await interaction.followup.send(f"충전 실패: {result['message']}", ephemeral=True)

class ProductSelectView(discord.ui.View):
    def __init__(self):
        super().__init__()

        options = [discord.SelectOption(label=product['name'], description=f"가격: {product['price']}원", value=product['name']) for product in PRODUCTS]

        self.select = discord.ui.Select(
            placeholder='제품을 선택하세요...',
            options=options
        )
        self.select.callback = self.select_callback
        self.add_item(self.select)

    async def select_callback(self, interaction: discord.Interaction):
        selected_product = next((product for product in PRODUCTS if product['name'] == self.select.values[0]), None)
        if selected_product:
            await interaction.response.send_message(f"{selected_product['name']}를(을) 구매하시겠습니까? 가격: {selected_product['price']}원", view=ConfirmPurchaseView(selected_product), ephemeral=True)

class ConfirmPurchaseView(discord.ui.View):
    def __init__(self, product):
        super().__init__()
        self.product = product

    @discord.ui.button(label='확인', style=discord.ButtonStyle.primary)
    async def confirm_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user_id = str(interaction.user.id)
        current_balance = get_balance(user_id)

        price = self.product['price']

        if current_balance >= price:
            new_balance = current_balance - price
            update_balance(user_id, new_balance)
            role = discord.utils.get(interaction.guild.roles, id=self.product['role_id'])
            if role:
                await interaction.user.add_roles(role)
                await interaction.response.send_message(
                    f"{self.product['name']} 구매 완료! 남은 잔액: {new_balance}원",
                    ephemeral=True
                )
                log_purchase(user_id, self.product['name'], self.product['price'])  # 구매 기록 추가
                # 구매 로그 채널에 메시지 보내기
                log_channel = bot.get_channel(LOG_CHANNEL_ID)
                if log_channel:
                    embed = discord.Embed(
                        title="구매 감사합니다!",
                        description=f"{interaction.user.display_name}님, {self.product['name']} 구매 감사합니다!",
                        color=discord.Color.green()
                    )
                    await log_channel.send(embed=embed)
        else:
            await interaction.response.send_message('잔액이 부족합니다.', ephemeral=True)

    @discord.ui.button(label='취소', style=discord.ButtonStyle.secondary)
    async def cancel_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('구매가 취소되었습니다.', ephemeral=True)

class MainMenuView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="충전", style=discord.ButtonStyle.primary, custom_id="charge")
    async def charge_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(ChargeModal())

    @discord.ui.button(label="정보", style=discord.ButtonStyle.secondary, custom_id="info")
    async def info_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user_id = str(interaction.user.id)
        balance = get_balance(user_id)
        await interaction.response.send_message(f'현재 잔액: {balance}원', ephemeral=True)

    @discord.ui.button(label="구매", style=discord.ButtonStyle.success, custom_id="buy")
    async def buy_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('구매할 제품을 선택하세요:', view=ProductSelectView(), ephemeral=True)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user}')
    channel = bot.get_channel(CHANNEL_ID)  # 특정 채널 ID
    if channel:
        embed = discord.Embed(title="자판기", description="충전 버튼을 눌러 핀번호를 입력하세요.")
        view = MainMenuView()
        await channel.send(embed=embed, view=view)


bot.run(TOKEN)
