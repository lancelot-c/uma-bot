import { Answer, postOnDiscord, saveAnswers } from "../test/utils";
import { COMMIT_PHASE, createPublicEthClient, decodeIdentifier, getCurrentPhase, getPendingRequests, logInfo } from "./common";
import fs from 'fs'
import 'dotenv/config'

const returnValue = await run()
fs.appendFileSync(process.env.GITHUB_OUTPUT as string, `votingRound=${returnValue}\n`)

async function run(): Promise<string> {

    const publicClient = createPublicEthClient()

    const isCommitPhase = (await getCurrentPhase(publicClient)) == COMMIT_PHASE
    const requests = await getPendingRequests(publicClient)
    const hasRequests = requests.length > 0
    const shouldCommitToday = isCommitPhase && hasRequests

    if (shouldCommitToday) {

        const pluralString = requests.length > 1 ? 's' : ''
        const votingRound = requests[0].lastVotingRound
        const offsetVotingRound = 10135
        const pullRequestNumber = votingRound - offsetVotingRound

        // Post in #dev channel
        await logInfo(`${requests.length} answer${pluralString} to find today`)

        // Post in #history channel
        let content = `📥 *** NEW VOTING ROUND (${requests.length} dispute${pluralString})***\n`
        content += `The UMA.rocks voting committee have until 11AM UTC to come to a consensus on [this pull request](<https://github.com/lancelot-c/uma-answers/pull/${pullRequestNumber}/files>) and merge it.`

        await postOnDiscord('', 0, '', [], content)

        // Create fresh answers.json
        let answers: Answer[] = []

        requests.forEach(r => {

            // Log error if the request identifier is unknown
            decodeIdentifier(r.identifier)


            // Create new answer object for request
            const decodedAncillaryData = decodeURIComponent(r.ancillaryData.slice(2).replace(/\s+/g, '').replace(/[0-9a-f]{2}/g, '%$&')); // converts a hex encoded UTF-8 string to a regular string, see https://stackoverflow.com/a/13865680
            console.log(`decodedAncillaryData:\n${decodedAncillaryData}\n\n`)

            answers.push({
                ancillaryData: r.ancillaryData,
                // question: 'test question',
                answer: 'P0'
            })
            
        })

        await saveAnswers(answers, votingRound)
        return votingRound.toString()
    }

    return '0'

}