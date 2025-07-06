import { createPublicEthClient, getAnswers, getPendingRequests, logError } from "./common"
import { postOnDiscord } from "../test/utils"


const publicClient = createPublicEthClient()

const requests = await getPendingRequests(publicClient)
if (requests.length == 0) {
    logError(`No request detected`)
    throw Error('No request detected')
}

const votingRound = requests[0].lastVotingRound
const answers = await getAnswers(votingRound)


if (answers) {

    // Post answers on UMA.rocks Discord
    const embedDescription = `The UMA.rocks voting committee has chosen the following answers for the current voting round. If you disagree with them you have 1 hour to vote for something else on your own, otherwise you don’t need to do anything as we will vote for you.`

    let embedFields: any[] = answers.map(a => {
        return {
            name: a.question,
            value: a.skip ? 'Undecided' : `${a.answer}`,
            inline: true
        }
    })

    await postOnDiscord("READY TO COMMIT 👌", 4626987, embedDescription, embedFields)

}