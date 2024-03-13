export default function arrayToString(arr: Array<string>): string {
	let stringKeywords: string;
	if (arr.length >= 1) {
		stringKeywords = `\"${arr[0]}\"`;
	}
	for (let i = 1; i < arr.length; i++) {
		stringKeywords = stringKeywords + `, \"${arr[i]}\"`;
	}
	return stringKeywords;
}  