import { testWithSynpress } from '@synthetixio/synpress'
import { ethereumWalletMockFixtures } from '@synthetixio/synpress/playwright'
import { scrapAnswers, postOnDiscord, saveAnswers } from './utils'
import 'dotenv/config'

const test = testWithSynpress(ethereumWalletMockFixtures)
// const { expect } = test


test(`Get correct answers and post them on Discord`, async ({ page }) => {

    // Let 10 minutes for the test to complete, fails otherwise
    test.setTimeout(10 * 60 * 1000);

    const [commitPhaseOpen, revealPhaseOpen, answers] = await scrapAnswers(page)

    // Is open for commiting votes
    if (commitPhaseOpen) {

        // Post answers on UMA.rocks Discord
        const embedDescription = `UMA.rocks has chosen the following answers for the current voting round. If you disagree with them you have 1 hour to vote for something else on your own, otherwise you don’t need to do anything as we will vote for you.`
    
        let embedFields: any[] = answers.map(a => {
            return {
                name: a.question,
                value: a.skip ? 'Undecided' : `${a.answer}`,
                inline: true
            }
        })
        
        await postOnDiscord("READY TO COMMIT 👌", 4626987, embedDescription, embedFields)
        
        // if (process.env.ATTEMPT_DISCORD_LOGIN === "true") {
        //     postOnUmaDiscord(page, answers)
        // }
        
        // Write answers in json file
        await saveAnswers(answers)
        
    }

})