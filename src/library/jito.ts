import { mainSearcherClient } from "../adapter/jito"

const getJitoTipAccount = async () => {
	const acc = await mainSearcherClient.getTipAccounts()
	const randomIndex = Math.floor(Math.random() * acc.length)
	return acc[randomIndex]
}

export { getJitoTipAccount }