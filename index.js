require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.TOKEN;
const PREFIX = '!'; 
const STAFF_ROLE_ID = 'ihavemyweight'; // ⚠️ آیدی نقش پشتیبانی رو اینجا بذار

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.content === PREFIX + 'setup-exchange' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        
        const embed = {
            color: 0x5865F2,
            title: 'Request an Exchange',
            description: `You can request an exchange by selecting the appropriate option below for the payment type you'll be sending with. Follow the instructions and fill out the fields as requested.\n\n**Reminder**\nPlease read our <#123456789012345678> before creating an Exchange.\n\n**Minimum Fees**\nOur minimum service fee is $7.00 USD and is applicable on every deal and is non-negotiable.`,
        };

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_payment_method')
            .setPlaceholder('Select Sending Payment Method')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('PayPal').setValue('PayPal').setEmoji('💳'),
                new StringSelectMenuOptionBuilder().setLabel('CashApp').setValue('CashApp').setEmoji('💵'),
                new StringSelectMenuOptionBuilder().setLabel('ApplePay').setValue('ApplePay').setEmoji('🍎'),
                new StringSelectMenuOptionBuilder().setLabel('Venmo').setValue('Venmo').setEmoji('🔵'),
                new StringSelectMenuOptionBuilder().setLabel('Zelle').setValue('Zelle').setEmoji('💜'),
                new StringSelectMenuOptionBuilder().setLabel('Crypto').setValue('Crypto').setEmoji('🪙')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_payment_method') {
        const selectedMethod = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`amount_modal_${selectedMethod}`)
            .setTitle('Exchange Details');

        const amountInput = new TextInputBuilder()
            .setCustomId('send_amount')
            .setLabel('How Much Will You Be Sending? ($)')
            .setPlaceholder('Format Example: 50 OR 53.80')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const receiveMethodInput = new TextInputBuilder()
            .setCustomId('receive_method')
            .setLabel('How do you want to receive it?')
            .setPlaceholder('Example: Zelle, Crypto, CashApp...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(amountInput),
            new ActionRowBuilder().addComponents(receiveMethodInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('amount_modal_')) {
        const sendMethod = interaction.customId.split('_')[2];
        const amount = parseFloat(interaction.fields.getTextInputValue('send_amount'));
        const receiveMethod = interaction.fields.getTextInputValue('receive_method');

        if (isNaN(amount) || amount <= 0) return interaction.reply({ content: 'Please enter a valid number.', ephemeral: true });

        let sendFeeRate = sendMethod === 'Crypto' ? 0.05 : 0.10;
        let receiveFeeRate = sendMethod === 'Crypto' ? 0.05 : 0.10;

        const sendFee = amount * sendFeeRate;
        const amountAfterSendFee = amount - sendFee;
        const receiveFee = amountAfterSendFee * receiveFeeRate;
        const finalReceiveAmount = amountAfterSendFee - receiveFee;
        const totalFee = sendFee + receiveFee;

        const embed = {
            color: 0x5865F2,
            title: `Exchange Confirmation`,
            description: `**Sending:**\n$${amount.toFixed(2)} via ${sendMethod}\n\n**Receiving:**\n$${finalReceiveAmount.toFixed(2)} via ${receiveMethod}\n\n**Fees:**\nTotal Fee: $${totalFee.toFixed(2)} (${(sendFeeRate*100)}% Sending + ${(receiveFeeRate*100)}% Receiving)`,
        };

        const confirmBtn = new ButtonBuilder().setCustomId(`confirm_${sendMethod}_${amount}_${receiveMethod}`).setLabel('✅ Confirm Exchange').setStyle(ButtonStyle.Success);
        const cancelBtn = new ButtonBuilder().setCustomId('cancel_exchange').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger);

        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'cancel_exchange') return interaction.update({ content: 'Exchange cancelled.', embeds: [], components: [] });

        if (interaction.customId.startsWith('confirm_')) {
            const parts = interaction.customId.split('_');
            const sendMethod = parts[1];
            const amount = parts[2];
            const receiveMethod = parts[3];

            await interaction.update({ content: 'Creating ticket...', embeds: [], components: [] });

            const guild = interaction.guild;
            const ticketChannel = await guild.channels.create({
                name: `exchange-${Math.floor(100000 + Math.random() * 900000)}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ],
            });

            const ticketEmbed = {
                color: 0x2b2d31,
                author: { name: `${interaction.user.username}`, icon_url: interaction.user.displayAvatarURL() },
                title: `${sendMethod} to ${receiveMethod} Exchange`,
                description: `Please be patient and wait for a reply as we are not always available.\n\n**Sending:**\n$${amount} via ${sendMethod}\n\n**Receiving:**\n${receiveMethod}\n\n**Exchanger:**\nUnclaimed`,
            };

            const closeBtn = new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('❌');
            const claimBtn = new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('👤');

            await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn, claimBtn)] });
            await interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
        }

        if (interaction.customId === 'claim_ticket') {
            if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) return interaction.reply({ content: 'Only staff members can claim exchanges.', ephemeral: true });
            const embed = interaction.message.embeds[0];
            const newEmbed = { color: 0x2b2d31, title: embed.title, description: embed.description.replace('Unclaimed', `<@${interaction.user.id}>`) };
            await interaction.update({ embeds: [newEmbed] });
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply({ content: 'Closing ticket in 5 seconds...', ephemeral: true });
            setTimeout(() => interaction.channel.delete(), 5000);
        }
    }
});

client.login(TOKEN);
