import { Answer, saveAnswers } from "../test/utils";
import { COMMIT_PHASE, createPublicEthClient, decodeIdentifier, getCurrentPhase, getPendingRequests } from "./common";
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

        let answers: Answer[] = []

        requests.forEach(r => {

            // Log error if the request identifier is unknown
            decodeIdentifier(r.identifier)

            // const decodedAncillaryData = decodeURIComponent(r.ancillaryData.slice(2).replace(/\s+/g, '').replace(/[0-9a-f]{2}/g, '%$&')); // converts a hex encoded UTF-8 string to a regular string, see https://stackoverflow.com/a/13865680
            // console.log(`decodedAncillaryData:\n${decodedAncillaryData}\n\n`)

            // Create new answer object for request
            answers.push({
                ancillaryData: r.ancillaryData,
                question: '', // will be populated later but need to be here to preserve the order "ancillaryData > question > answer" in the json file
                answer: 'P0'
            })
            
        })

        // Create fresh answers file
        const votingRound = requests[0].lastVotingRound
        await saveAnswers(answers, votingRound)

        return votingRound.toString()
    }

    return '0'

}