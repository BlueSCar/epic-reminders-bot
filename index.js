const Discord = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const { CronJob, job } = require('cron');

(async () => {
    dotenv.config();

    const commandChannelId = process.env.COMMAND_CHANNEL_ID;
    const reactionChannelId = process.env.REACTIONS_CHANNEL_ID;
    const adminId = process.env.ADMIN_ID;

    let commandChannel, reactionChannel;
    let config = fs.existsSync('./config.json') ? require('./config') : {
        reactionMessageId: null,
        members: []
    };

    for (let member of config.members) {
        for (let cooldown of member.cooldowns) {
            if (cooldown.nextUp && new Date() >= new Date(cooldown.nextUp)) {
                cooldown.nextUp = null;
            }
        }
    }

    const commandFormat = /^rpg (\w+)/;

    const client = new Discord.Client();

    client.on('message', msg => {
        let member = config.members.find(m => m.id === msg.author.id);
        if (msg.channel.id === commandChannelId && member && member.bonuses && member.bonuses.length) {
            const cleaned = msg.content.toLowerCase().trim();
            const results = commandFormat.exec(cleaned);
            if (results && results.length > 1) {
                const command = require('./commands').find(c => c.aliases.includes(results[1]));

                if (command) {
                    let bonus = command.donorModifier ? Math.min(...member.bonuses) : 1;
                    let seconds = Math.round(command.baseSeconds * bonus * 1000);
                    let date = new Date(msg.createdTimestamp + seconds);

                    let memberCommand = member.cooldowns.find(c => c.name == command.name);
                    if (!memberCommand) {
                        member.cooldowns.push({
                            name: command.name,
                            nextUp: date
                        });
                    } else {
                        memberCommand.nextUp = date;
                    }
                }
            }
        }
        
        if (msg.channel.id === commandChannelId && msg.author.id == adminId) {
            const cleaned = msg.content.toLowerCase().trim();
            const results = commandFormat.exec(cleaned);

            if (results && results.length > 1) {
                if (results[1] === 'dump') {
                    fs.writeFileSync('./config.json', JSON.stringify(config, null, '\t'));
                }
            }
        }
    });

    client.on('messageReactionAdd', (reaction, user) => {
        if (reaction.message.id == config.reactionMessageId && !user.bot) {
            let member = config.members.find(m => m.id === user.id);
            if (!member) {
                member = {
                    id: user.id,
                    username: user.username,
                    discriminator: user.discriminator,
                    bonuses: [],
                    cooldowns: []
                };
                config.members.push(member);
            }

            if (reaction.emoji.name === '🌕') {
                member.bonuses.push(1);
            } else if (reaction.emoji.name === '🌗') {
                member.bonuses.push(0.9);
            } else if (reaction.emoji.name === '🌘') {
                member.bonuses.push(0.8);
            } else if (reaction.emoji.name === '🌑') {
                member.bonuses.push(0.65);
            }

            fs.writeFileSync('./config.json', JSON.stringify(config, null, '\t'));
        }
    });

    client.on('messageReactionRemove', (reaction, user) => {
        if (reaction.message.id == config.reactionMessageId && !user.bot) {
            let member = config.members.find(m => m.id === user.id);
            if (!member) {
                member = {
                    id: user.id,
                    username: user.username,
                    discriminator: user.discriminator,
                    bonuses: [],
                    cooldowns: []
                };
                config.members.push(member);
            }

            if (reaction.emoji.name === '🌕') {
                member.bonuses.splice(member.bonuses.indexOf(1));
            } else if (reaction.emoji.name === '🌗') {
                member.bonuses.splice(member.bonuses.indexOf(0.9));
            } else if (reaction.emoji.name === '🌘') {
                member.bonuses.splice(member.bonuses.indexOf(0.8));
            } else if (reaction.emoji.name === '🌑') {
                member.bonuses.splice(member.bonuses.indexOf(0.65));
            }

            fs.writeFileSync('./config.json', JSON.stringify(config, null, '\t'));
        }
    });

    client.login(process.env.DISCORD_BOT_TOKEN);

    client.on('ready', async () => {
        commandChannel = await client.channels.fetch(commandChannelId);
        reactionChannel = await client.channels.fetch(reactionChannelId);

        if (!config.reactionMessageId) {
            const embed = new Discord.MessageEmbed()
                .setTitle('Epic Grind Assist')
                .setColor(0x03bafc)
                .setDescription(`
    React to this message to get reminders
    
    :full_moon: => react if you are a normal (non-donor) player
    :last_quarter_moon: => react if you are a donor with 10% cooldown bonus
    :waning_crescent_moon: => react if you are a donor with 20% cooldown bonus
    :new_moon: => react if you are a donor with 35% cooldown bonus
                                `);

            const msg = await reactionChannel.send(embed);
            config.reactionMessageId = msg.id;
            await msg.react('🌕');
            await msg.react('🌗');
            await msg.react('🌘');
            await msg.react('🌑');
            fs.writeFileSync('./config.json', JSON.stringify(config, null, '\t'));
        } else {
            await reactionChannel.messages.fetch(config.reactionMessageId);
        }

        const job = new CronJob('* * * * * *', async () => {
            const now = new Date();
            for (let member of config.members) {
                for (let cooldown of member.cooldowns) {
                    if (cooldown.nextUp && now >= new Date(cooldown.nextUp)) {
                        cooldown.nextUp = null;
                        await commandChannel.send(`<@${member.id}> rpg ${cooldown.name}`);
                    }
                }
            }
        });
        job.start()
    });
})().catch(err => {
    console.error(err);
});