import { testWithSynpress } from '@synthetixio/synpress'
import { ethereumWalletMockFixtures } from '@synthetixio/synpress/playwright'
import { scrapAnswers, saveAnswers } from './utils'
import { getTempAnswers, logError } from '../smart-contract-calls/common'
import 'dotenv/config'

const test = testWithSynpress(ethereumWalletMockFixtures)


test(`Enrich answers`, async ({ page }) => {

    // Let 10 minutes for the test to complete, fails otherwise
    test.setTimeout(10 * 60 * 1000);

    if (process.argv) {

        process.argv.forEach((element, index) => {
            console.log(`process.argv #${index}`, element)
        });
    }

    const votingRound = Number(process.argv[2])
    const enrichedAnswers = await getTempAnswers(votingRound)

    if (!enrichedAnswers) {
        logError(`Can't load temp answers before enrichment`)
        return
    }

    const [commitPhaseOpen, revealPhaseOpen, scrapedAnswers] = await scrapAnswers(page)

    enrichedAnswers.map(enrichedAnswer => {

        const foundAnswer = scrapedAnswers.find(a => a.ancillaryData == enrichedAnswer.ancillaryData)

        if (foundAnswer) {
            enrichedAnswer.question = foundAnswer.question
            enrichedAnswer.answer = foundAnswer.answer
        }

        return enrichedAnswer
    })
    

    // Write answers in json file
    await saveAnswers(enrichedAnswers, votingRound)

})