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
import {
    getGuildConfig,
    setGuildConfig
} from '../../services/config/guildConfig.js';

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

        // =========================
        // /ticket setup
        // =========================
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Sets up the ticket creation panel.")

                .addChannelOption(option =>
                    option
                        .setName("panel_channel")
                        .setDescription("The channel where the ticket panel will be sent.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("panel_message")
                        .setDescription("The main message for the ticket panel.")
                        .setRequired(false)
                )

                .addStringOption(option =>
                    option
                        .setName("button_label")
                        .setDescription("Legacy ticket button label.")
                        .setRequired(false)
                )

                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("The category where tickets will be created.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )

                .addChannelOption(option =>
                    option
                        .setName("closed_category")
                        .setDescription("The category where closed tickets will be moved.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )

                .addRoleOption(option =>
                    option
                        .setName("staff_role")
                        .setDescription("The role that can access tickets.")
                        .setRequired(false)
                )

                .addIntegerOption(option =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum tickets a user can create.")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false)
                )

                .addBooleanOption(option =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Send a DM when a ticket is closed.")
                        .setRequired(false)
                )
        )

        // =========================
        // /ticket dashboard
        // =========================
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

        // =========================
        // PERMISSION
        // =========================

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'You need the `Manage Channels` permission for this action.'
            });
        }

        const subcommand =
            interaction.options.getSubcommand();

        // =========================
        // DASHBOARD
        // =========================

        if (subcommand === "dashboard") {
            return ticketConfig.execute(
                interaction,
                config,
                client
            );
        }

        // =========================
        // SETUP
        // =========================

        if (subcommand !== "setup") return;

        const existingConfig =
            await getGuildConfig(
                client,
                interaction.guildId
            );

        if (existingConfig?.ticketPanelChannelId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    `This server already has a ticket system set up in <#${existingConfig.ticketPanelChannelId}>.\n\n` +
                    `Use \`/ticket dashboard\` to manage it.`
            });
        }

        const panelChannel =
            interaction.options.getChannel(
                "panel_channel"
            );

        const categoryChannel =
            interaction.options.getChannel(
                "category"
            );

        const closedCategoryChannel =
            interaction.options.getChannel(
                "closed_category"
            );

        const staffRole =
            interaction.options.getRole(
                "staff_role"
            );

        const panelMessage =
            interaction.options.getString(
                "panel_message"
            ) ||
            "Need help? Select a ticket category below.";

        const maxTicketsPerUser =
            interaction.options.getInteger(
                "max_tickets_per_user"
            ) || 3;

        const dmOnClose =
            interaction.options.getBoolean(
                "dm_on_close"
            ) !== false;

        // =========================
        // PANEL EMBED
        // =========================

        const setupEmbed = createEmbed({
            title: "👋╺╸𝘛𝘪𝘤𝘬𝘦𝘵",

            description:
                `${panelMessage}\n\n` +

                "🛠️ **Support**\n" +
                "General help, questions, reports, and player issues.\n\n" +

                "🤝 **Partnerships**\n" +
                "Server partnerships, collaborations, and advertisements.\n\n" +

                "🛒 **Store**\n" +
                "Purchases, payment problems, and store support.\n\n" +

                "> Select the appropriate category below.",

            color: getColor('info')
        });

        // =========================
        // 3 BUTTONS
        // =========================

        const ticketButtons =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId("ticket_support")
                        .setLabel("Support")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("🛠️"),

                    new ButtonBuilder()
                        .setCustomId("ticket_partnership")
                        .setLabel("Partnerships")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("🤝"),

                    new ButtonBuilder()
                        .setCustomId("ticket_store")
                        .setLabel("Store")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("🛒")
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

            if (
                client.db &&
                interaction.guildId
            ) {

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

            // =========================
            // SUCCESS
            // =========================

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        successEmbed(
                            "Ticket Panel Set Up",
                            `The ticket panel with **Support, Partnerships, and Store** buttons has been sent to ${panelChannel}.`
                        )
                    ]
                }
            );

        } catch (error) {

            logger.error(
                "Ticket setup error",
                {
                    error: error.message,
                    stack: error.stack,
                    guildId:
                        interaction.guildId
                }
            );

            return await handleInteractionError(
                interaction,
                error,
                {
                    commandName:
                        "ticket_setup",

                    source:
                        "ticket_setup_command"
                }
            );
        }
    }
};
