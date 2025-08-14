import { test } from '@playwright/test';
import { scrapAnswers, saveAnswers } from './utils'
import { createPublicEthClient, getPendingRequests, getTempAnswers, logError } from '../smart-contract-calls/common'
import 'dotenv/config'


test('Enrich answers', async ({ page }) => {

    // Let 10 minutes for the test to complete, fails otherwise
    test.setTimeout(10 * 60 * 1000);

    // TODO: get votingRound directly from process.env.GITHUB_OUTPUT in order to minimize RPC calls
    const publicClient = createPublicEthClient()
    const requests = await getPendingRequests(publicClient)
    const votingRound = requests[0].lastVotingRound

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