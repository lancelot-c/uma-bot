require('dotenv').config()
const json = require('../test-data/answers.json')

let questions = json.questions
let answers = json.answers

// Post answers on UMA.rocks Discord
const embedDescription = `These are the answers our pool has chosen for the current voting round. If you disagree with them you have 1 hour to vote for something else on your own, otherwise you don’t need to do anything as we will vote for you.`

let embedFields = []
answers.forEach((a, i) => embedFields.push({
    name: questions[i],
    value: `P${a}`,
    inline: true
}))

const content = ''

const webhookUrl = process.env.DISCORD_CHANNEL_HISTORY_WEBHOOK_URL

postOnDiscord("READY TO COMMIT 👌", 4626987, embedDescription, embedFields, content, webhookUrl)


function postOnDiscord(embedTitle, embedColor, embedDescription, embedFields, content, customWebhookUrl) {

    console.log('> Post message on #history channel of UMA.rocks Discord')

    const embed = {
        "title": embedTitle,
        "description": embedDescription,
        "color": embedColor, // decimal index of a color, see https://www.spycolor.com
        "fields": embedFields
    }

    const params = {
        "content": content,
        "embeds": [embed]
    }

    const webhookUrl = customWebhookUrl ? customWebhookUrl : process.env.DISCORD_CHANNEL_HISTORY_WEBHOOK_URL

    console.log('embedTitle: ', embedTitle)
    console.log('embedDescription: ', embedDescription)
    console.log('embedFields: ', embedFields)
    console.log('content: ', content)
    console.log('webhookUrl: ', webhookUrl)

    fetch(webhookUrl, {
        method: "POST",
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify(params)
    }).then(res => {
        console.log(`Webhook response: { status: ${res.status}, statusText: ${res.statusText}, ok: ${res.ok} }`);
    })

}