const puppeteer = require('puppeteer')
const fs = require('fs')
const { getDT, log, capitalize } = require('./helper')
const selectors = {
	content: 'div#contentColumn',
	matchItem: 'a[href*="/live/ledni-hokej-"]',
	score: 'div.a-sticker--score',
	eventTable: 'div.eventTable',
	eventTableHeader: 'div.eventTableHeaderWrapper',
	eventTableName: 'div.name',
	eventTableBody: 'div.eventTableHeaderWrapper + div.tbodyEventTable',
	eventTableRow: 'div.trEventTable',
	eventTableCells: 'div.tdEventCells > div',
	eventTableCellName: 'span.name',
	eventTableCellValue: 'span.value',
}

class Parser
{	
	constructor () {
		this.config = {}
		this.browser = null
		this.mainPage = null
		this.matchPage = null
		this.parsing = false
	}

	async load () {
		if (!this.parsing) {
			this.parsing = true
			await this.getConfig()
			await this.init()
			await this.parseMatches()
			this.parsing = false
		}
	}

	async reload () {
		if (!this.parsing) {
			this.parsing = true
			await this.parseMatches()
			this.parsing = false
		}
	}

	async getConfig () {
	  const configData = await fs.promises.readFile('config.json')
	  this.config = JSON.parse(configData.toString())
	}

	async init () {		
		this.browser = await puppeteer.launch({
			args: ['--window-size=1920,1080'],
	    headless: true
		})
		for (let page of ['matchPage', 'mainPage']) {
			this[page] = await this.browser.newPage()
			await this[page].setDefaultNavigationTimeout(0)
			await this[page].setViewport({
				width: 1920,
				height: 980
			})
			this[page].on('error', err => {
				log(`Error happen at the ${page}: `, err)
			})
		}
	}

	async parseMatches (url) {
		await this.mainPage.goto(this.config.parse_url, { waitUntil: ['networkidle2', 'domcontentloaded'] })
		await this.scrollToBottom(this.mainPage)
		await this.mainPage.waitForSelector(selectors.content)
		const content = await this.mainPage.$(selectors.content)
		const matches = await content.$$(selectors.matchItem)
		log(`[${getDT()}]: Found total ${matches.length} matches`)
		for (const match of matches) {
			const scoreBadge = await match.$(selectors.score)
			let score = [0, 0]
			if (scoreBadge) {
				score = await match.$eval(selectors.score, el => el.innerText.trim().split(':'))
			}
			const sumGoals = Number(score[0]) + Number(score[1])
			const info = await match.$$eval('span', els => els.map(el => el.innerText.trim()))
			const teams = info[0]
			const timings = info[1]
			const { period, totalMinute, periodMinute } = this.getMatchTime(timings)
			const periodSumGoals = await this.getPeriodSumGoals(timings, period)
			const href = await this.mainPage.evaluate(el => el.getAttribute('href'), match)
			const { coefs } = await this.parseMatch(href, period)
			await this.saveMatch('total', {
				datetime: getDT(),
				link: this.config.home_url + href,
				teams,
				period,
				minute: periodMinute,
				goals: sumGoals,
				periodGoals: periodSumGoals,
				coefs
			})
			if (period == this.config.data.period && (totalMinute == this.config.data.minute || periodMinute == this.config.data.minute) && periodSumGoals <= this.config.data.goals) {
				log(`[${getDT()}]: Found fit match: ${teams}, ${period} period, ${periodMinute}(${totalMinute}) minute, score: ${score.join(':')}`)
				await this.saveMatch('result', {
					datetime: getDT(),
					link: this.config.home_url + href,
					teams,
					period,
					minute: periodMinute,
					goals: sumGoals,
					periodGoals: periodSumGoals,
					coefs
				})
			}
		}
	}

	getPeriodSumGoals (timings, period) {
		if (timings.includes('(') && timings.includes(')')) {
			const periodsScores = timings.substring(
		    timings.indexOf('(') + 1, 
		    timings.lastIndexOf(')')
			)
			const periodsScoresArray = periodsScores.split(',')
			if (periodsScoresArray.length == period) {
				const periodScore = periodsScoresArray[period - 1].trim().split(':')
				return Number(periodScore[0]) + Number(periodScore[1])
			}
		}
		return null
	}

	getMatchTime (timings) {
		const timingsArray = timings.split('.')
		let period = null, totalMinute = null, periodMinute = null
		if (timingsArray.length >= 1) {
			period = Number(timingsArray[0].replace(/ /g, ''))
		}
		if (timingsArray.length >= 3) {
			totalMinute = Number(timingsArray[2].replace(/ /g, '').replace(/-/g, ''))
			periodMinute = totalMinute - ((period - 1) * 20)
		}
		return { period, totalMinute, periodMinute }
	}

	async parseMatch (matchUrl, period) {
		const coefs = []
		await this.matchPage.goto(this.config.home_url + matchUrl, { waitUntil: ['networkidle2', 'domcontentloaded'] })
		await this.scrollToBottom(this.matchPage)
		const eventTables = await this.matchPage.$$(selectors.eventTable)
		for (const eventTable of eventTables) {
			const tableHeader = await eventTable.$(selectors.eventTableHeader)
			const tableName = await tableHeader.$eval(selectors.eventTableName, el => el.innerText.trim())
			const coefTableName = this.getCoefTableName(period)
			if (tableName == coefTableName) {
				console.log(tableName)
				const tableBody = await eventTable.$(selectors.eventTableBody)
				const tableRows = await tableBody.$$(selectors.eventTableRow)
				for (const tableRow of tableRows) {
					const tableCells = await tableRow.$$(selectors.eventTableCells)
					for (const tableCell of tableCells) {
						const tableCellNameBlock = await tableCell.$(selectors.eventTableCellName)
						const tableCellValueBlock = await tableCell.$(selectors.eventTableCellValue)
						if (tableCellNameBlock && tableCellValueBlock) {
							const tableCellName = await tableCell.$eval(selectors.eventTableCellName, el => el.innerText.trim())
							const tableCellValue = await tableCell.$eval(selectors.eventTableCellValue, el => el.innerText.trim())
							console.log(`${tableCellName}: ${tableCellValue}`)
							coefs.push({
								name: tableCellName,
								value: tableCellValue,
							})
						}
					}
				}
			}
		}
		return { coefs }
	}

	getCoefTableName (period) {
		if (period == 1) {
			return `Počet gólů v 1. třetině`
		} else if (period == 2) {
			return `Počet gólů ve 2. třetině`
		} else if (period == 3) {
			return 'Počet gólů v zápasu'
		} else return null
	}

	async saveMatch (file, data) {
		let matchInfo = ''
		for (const param in data) {
			if (param != 'coefs') {
				matchInfo += `${capitalize(param)}: ${data[param]}\n`
			}
		}
		for (const coef of data.coefs) {
			matchInfo += `${coef.name}: ${coef.value}\n`
		}
		matchInfo += '\n'
		await fs.promises.appendFile(`${file}.txt`, matchInfo)
	}

	async scrollToBottom (page) {		
    await page.evaluate(async () => {
      await new Promise(async (resolve, reject) => {
        var totalHeight = 0
        var distance = 100
        var timer = await setInterval(() => {
          var scrollHeight = document.body.scrollHeight
          window.scrollBy(0, distance)
          totalHeight += distance

          if (totalHeight >= scrollHeight) {
            clearInterval(timer)
            resolve()
          }
        }, 100)
      })
    })
	}
}

module.exports = Parser
