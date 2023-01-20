const cron = require('cron')
const Parser = require('./lib/parser')
const { getDT, log } = require('./lib/helper')

let launched = false
let parser = new Parser()

async function run () {
	if (!launched) {
		log(`[${getDT()}]: Parser started`)
		launched = true
		await parser.load()
	}
	else {
		log(`[${getDT()}]: Parser reload`)
		await parser.reload()
	}
}

const schedule = {}

schedule.run = new cron.CronJob({
    cronTime: '* * * * *',
    onTick: run,
    start: true,
    runOnInit: true
})
