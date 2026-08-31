import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';

import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import {
    handleInteractionError,
    replyUserError,
    ErrorTypes
} from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Sets up the ticket panel.")

                .addChannelOption(option =>
                    option
                        .setName("panel_channel")
                        .setDescription("Channel where the ticket panel will be sent.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("panel_message")
                        .setDescription("Ticket panel message.")
                        .setRequired(false)
                )

                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("Category where tickets will be created.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )

                .addChannelOption(option =>
                    option
                        .setName("closed_category")
                        .setDescription("Category where closed tickets will be moved.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )

                .addRoleOption(option =>
                    option
                        .setName("staff_role")
                        .setDescription("Staff role that can access tickets.")
                        .setRequired(false)
                )

                .addIntegerOption(option =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum tickets per user.")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false)
                )

                .addBooleanOption(option =>
                    option
                        .setName("dm_on_close")
                        .setDescription("DM the user when their ticket closes.")
                        .setRequired(false)
                )
        )

        // KEEPING /ticket dashboard
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the interactive ticket system dashboard.")
        ),

    category: "ticket",

    async execute(interaction, config, client) {

        const deferred = await InteractionHelper.safeDefer(
            interaction,
            { flags: MessageFlags.Ephemeral }
        );

        if (!deferred) return;

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: "You need the `Manage Channels` permission."
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // =========================
        // /ticket dashboard
        // =========================

        if (subcommand === "dashboard") {
            return ticketConfig.execute(
                interaction,
                config,
                client
            );
        }

        // =========================
        // /ticket setup
        // =========================

        if (subcommand === "setup") {

            const existingConfig =
                await getGuildConfig(
                    client,
                    interaction.guildId
                );

            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        `A ticket system already exists in <#${existingConfig.ticketPanelChannelId}>.\n\n` +
                        `Use \`/ticket dashboard\` to manage it.`
                });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");

            const categoryChannel =
                interaction.options.getChannel("category");

            const closedCategoryChannel =
                interaction.options.getChannel("closed_category");

            const staffRole =
                interaction.options.getRole("staff_role");

            const panelMessage =
                interaction.options.getString("panel_message") ||
                "Please select the type of ticket you want to open.";

            const maxTicketsPerUser =
                interaction.options.getInteger("max_tickets_per_user") || 3;

            const dmOnClose =
                interaction.options.getBoolean("dm_on_close") !== false;

            // =========================
            // PANEL
            // =========================

            const setupEmbed = createEmbed({
                title: "👋╺╸𝘛𝘪𝘤𝘬𝘦𝘵",

                description:
                    `${panelMessage}\n\n` +

                    "🛠️ **Support**\n" +
                    "Need help or have a question?\n\n" +

                    "🤝 **Partnerships**\n" +
                    "Want to partner with our server?\n\n" +

                    "🛒 **Store**\n" +
                    "Need help with a purchase or payment?\n\n" +

                    "> Select a category below to open a ticket.",

                color: getColor("info")
            });

            // =========================
            // ⭐ THE 3 BUTTONS ⭐
            // =========================

            const ticketButtons =
                new ActionRowBuilder().addComponents(

                    new ButtonBuilder()
                        .setCustomId("create_ticket_support")
                        .setLabel("Support")
                        .setEmoji("🛠️")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId("create_ticket_partnership")
                        .setLabel("Partnerships")
                        .setEmoji("🤝")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId("create_ticket_store")
                        .setLabel("Store")
                        .setEmoji("🛒")
                        .setStyle(ButtonStyle.Secondary)
                );

            // =========================
            // SEND PANEL
            // =========================

            try {

                const sentPanel =
                    await panelChannel.send({
                        embeds: [setupEmbed],
                        components: [ticketButtons]
                    });

                // =========================
                // SAVE CONFIG
                // =========================

                if (client.db && interaction.guildId) {

                    const currentConfig =
                        existingConfig || {};

                    currentConfig.ticketCategoryId =
                        categoryChannel
                            ? categoryChannel.id
                            : null;

                    currentConfig.ticketClosedCategoryId =
                        closedCategoryChannel
                            ? closedCategoryChannel.id
                            : null;

                    currentConfig.ticketStaffRoleId =
                        staffRole
                            ? staffRole.id
                            : null;

                    currentConfig.ticketPanelChannelId =
                        panelChannel.id;

                    currentConfig.ticketPanelMessageId =
                        sentPanel.id;

                    currentConfig.ticketPanelMessage =
                        panelMessage;

                    currentConfig.maxTicketsPerUser =
                        maxTicketsPerUser;

                    currentConfig.dmOnClose =
                        dmOnClose;

                    await setGuildConfig(
                        client,
                        interaction.guildId,
                        currentConfig
                    );
                }

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [
                            successEmbed(
                                "Ticket Panel Set Up",
                                `Ticket panel with **3 buttons** has been sent to ${panelChannel}.`
                            )
                        ]
                    }
                );

            } catch (error) {

                logger.error("Ticket setup error", {
                    error: error.message,
                    stack: error.stack,
                    guildId: interaction.guildId
                });

                return await handleInteractionError(
                    interaction,
                    error,
                    {
                        commandName: "ticket_setup",
                        source: "ticket_setup_command"
                    }
                );
            }
        }
    }
};
