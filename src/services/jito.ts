import { fastTrackSearcherClient } from "../adapter/jito"

const getJitoTipAccount = async () => {
	const acc = await fastTrackSearcherClient.getTipAccounts()
	const randomIndex = Math.floor(Math.random() * acc.length)
	return acc[randomIndex]
}

export { getJitoTipAccount }