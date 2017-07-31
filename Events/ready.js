const auth = require("../Configurations/auth.js");
// const getNewServerData = require("../Modules/NewServer.js");
// const setReminder = require("../Modules/SetReminder.js");
// const setCountdown = require("../Modules/SetCountdown.js");
// const sendStreamingRSSUpdates = require("../Modules/StreamingRSS.js");
// const sendStreamerMessage = require("../Modules/StreamChecker.js");
// const createMessageOfTheDay = require("../Modules/MessageOfTheDay.js");
// const runTimerExtension = require("../Modules/TimerExtensionRunner.js");
// const postData = require("../Modules/PostData.js");
const { Utils } = require("../Modules/");
const {
	ClearServerStats: clearStats,
	SetReminder: setReminder,
} = Utils;

/* eslint-disable max-len */
module.exports = async (bot, db, configJS, configJSON) => {
	// TODO: Handler for these messages
	bot.shard.send(`[READY:${bot.shard.id}] guilds:${bot.guilds.size} channels:${bot.channels.size} users:${bot.users.size}`);

	// Count a server's stats (games, clearing, etc.);
	const statsCollector = async () => {
		const promiseArray = [];
		const countServerStats = async server => {
			const serverDocument = await db.servers.findOne({ _id: server.id }).catch(err => {
				winston.warn(`Failed to find a server document for counting stats`, { svrid: server.id }, err);
			});
			if (serverDocument) {
				// Clear stats for server if older than a week
				if (Date.now() - serverDocument.stats_timestamp >= 604800000) {
					await clearStats(bot, db, server, serverDocument);
				} else {
					// Iterate through all members
					server.members.forEach(async member => {
						if (member.id !== bot.user.id && !member.user.bot) {
							const game = await bot.getGame(member);
							if (game !== "" && member.presence.status === "online") {
								let gameDocument = serverDocument.games.id(game);
								if (!gameDocument) {
									serverDocument.games.push({ _id: game });
									gameDocument = serverDocument.games.id(game);
								}
								gameDocument.time_played++;
							}

							// Kick member if they're inactive and autokick is on
							const memberDocument = serverDocument.members.id(member.id);
							if (memberDocument && serverDocument.config.moderation.isEnabled && serverDocument.config.moderation.autokick_members.isEnabled && Date.now() - memberDocument.last_active > serverDocument.config.moderation.autokick_members.max_inactivity && !memberDocument.cannotAutokick && bot.getUserBotAdmin(server, serverDocument, member) === 0) {
								try {
									await member.kick(`Kicked for inactivity on the server.`);
									winston.info(`Kicked member "${member.user.tag}" due to inactivity on server "${server}"`, { svrid: server.id, usrid: member.id });
								} catch (err) {
									memberDocument.cannotAutokick = true;
									winston.warn(`Failed to kick member "${member.user.tag}" due to inactivity on server "${server}"`, { svrid: server.id, usrid: member.id }, err);
								}
							}
						}
					});
					try {
						await serverDocument.save();
					} catch (err) {
						winston.warn(`Failed to save server data for stats..`, { svrid: server.id }, err);
					}
				}
			}
		};
		bot.guilds.forEach(guild => {
			promiseArray.push(countServerStats(guild));
		});
		await Promise.all(promiseArray);
	};

	// Set existing reminders to send message when they expire
	const setReminders = async () => {
		const promiseArray = [];
		const userDocuments = await db.users.find({ reminders: { $not: { $size: 0 } } }).catch(err => {
			winston.warn(`Failed to get reminders`, err);
		});
		if (userDocuments) {
			for (let i = 0; i < userDocuments.length; i++) {
				for (let j = 0; j < userDocuments[i].reminders.length; j++) {
					promiseArray.push(setReminder(bot, userDocuments[i], userDocuments[i].reminders[j]));
				}
			}
		}
		await Promise.all(promiseArray);
	};
};