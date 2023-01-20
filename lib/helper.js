const fs = require('fs')
const moment = require('moment')

const getDate = () => {
	return moment().format('YYYY-MM-DD')
}

const getDT = () => {
	return moment().format('YYYY-MM-DD HH:mm:ss')
}

const log = async (data) => {
	console.log(data)
	const content = ((typeof data == 'object') ? JSON.stringify(data) : data) + "\n"
	await fs.promises.appendFile(`logs/log-${getDate()}.log`, content)
}

const capitalize = (string) => {
	return string.charAt(0).toUpperCase() + string.slice(1)
}

const isFile = async (path) => {
  const result = await fs.promises.stat(path).catch(err => {
    if (err.code === 'ENOENT') {
      return false
    }
    throw err
  })
  return !result ? false : true
}

module.exports = {
	getDT,
	log,
	capitalize,
	isFile
}
