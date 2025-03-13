import cron from 'node-cron'
import axios from 'axios'
import PocketBase from 'pocketbase'
import dotenv from 'dotenv'

dotenv.config()
// Initialize PocketBase client

// Function to authenticate with PocketBase (if needed)
async function authenticatePB() {
  const pb = new PocketBase('https://pb1.amorees.com/')

  try {
    // Use admin authentication or other authentication method as needed
    await pb
      .collection('_superusers')
      .authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD)
    console.log('Authenticated with PocketBase')
  } catch (error) {
    console.error('Failed to authenticate with PocketBase:', error)
  }

  return pb
}

// Function to process a single payment
async function processPayment(paymentToken) {
  try {
    console.log(`Processing payment: ${paymentToken}`)

    // Call your existing endpoint with the payment token
    const response = await axios.post(process.env.SUBMIT_URL, {
      paymentToken,
      amount: 1,
      fromCron: true
    })

    console.log(`Payment ${paymentToken} processed:`, response.data)
    return response.data
  } catch (error) {
    console.error(`Error processing payment ${paymentToken}:`, error.message)
    if (error.response) {
      console.error('Response data:', error.response.data)
    }
    return null
  }
}

// Function to check and process payments
async function checkAndProcessPayments(pb) {
  try {
    console.log('Checking for new paid payments...')

    // Query PocketBase for payments with status = 'paid'
    const records = await pb.collection('payments').getFullList({
      filter: `status="paid" && distancing=${true}`,
      sort: 'created'
    })

    console.log(`Found ${records.length} paid payments to process`)

    // Process each payment sequentially
    for (const record of records) {
      // Check if the payment should be processed now (respecting distancing if set)
      if (record.distancing && record.nextSubmitDate) {
        const nextDate = new Date(record.nextSubmitDate).getTime()
        const now = new Date().getTime()

        if (now < nextDate) {
          console.log(`Skipping payment ${record.id} - scheduled for ${new Date(nextDate)}`)
          continue
        }
      }

      // Process the payment
      await processPayment(record.id)

      // Optional: Add a small delay between processing each payment
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error('Error checking for payments:', error)
  }
}

// Function to generate random time for stop (23:00 - 23:59) and start (06:00 - 07:59)
function generateRandomTimes() {
  const randomStopHour = 23 // Fixed at 23
  const randomStopMinute = Math.floor(Math.random() * 60) // 0 to 59
  const randomStartHour = Math.floor(Math.random() * 2) + 6 // 6 to 7
  const randomStartMinute = Math.floor(Math.random() * 60) // 0 to 59

  return {
    stopHour: randomStopHour,
    stopMinute: randomStopMinute,
    startHour: randomStartHour,
    startMinute: randomStartMinute
  }
}

// Store today's random times
let dailyTimes = generateRandomTimes()
// Store the current day to reset times daily
let currentDay = null

async function startCronJob() {
  try {
    // Authenticate with PocketBase
    const pb = await authenticatePB()

    // Schedule the cron job to run every minute
    cron.schedule('* * * * *', async () => {
      // Get current Vietnam time
      const now = new Date()
      const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
      const hours = vietnamTime.getHours()
      const minutes = vietnamTime.getMinutes()
      const day = vietnamTime.getDate()

      // Reset random times at midnight (new day)
      if (currentDay !== day) {
        dailyTimes = generateRandomTimes()
        currentDay = day
        console.log(
          `New daily schedule - Stop: ${dailyTimes.stopHour}:${dailyTimes.stopMinute}, Start: ${dailyTimes.startHour}:${dailyTimes.startMinute}`
        )
      }

      // Check if current time is within restricted period
      const isBeforeStop =
        hours < dailyTimes.stopHour || (hours === dailyTimes.stopHour && minutes <= dailyTimes.stopMinute)

      const isAfterStart =
        hours > dailyTimes.startHour || (hours === dailyTimes.startHour && minutes >= dailyTimes.startMinute)

      const isRestrictedTime = !(isBeforeStop && isAfterStart)

      if (isRestrictedTime) {
        console.log(
          `Cron job skipped - within restricted time (Stop: ${dailyTimes.stopHour}:${dailyTimes.stopMinute}, Start: ${dailyTimes.startHour}:${dailyTimes.startMinute})`
        )
        return
      }

      // Generate random delay between 0 and 59 seconds
      const randomDelay = Math.floor(Math.random() * 60) * 1000

      console.log(`Scheduled run with ${randomDelay / 1000} seconds delay...`)

      // Wait for the random delay before processing
      await new Promise(resolve => setTimeout(resolve, randomDelay))

      console.log('Running payment processing cron job...')
      await checkAndProcessPayments(pb)
    })

    console.log('Payment processing cron job started')

    // Initial run check
    const now = new Date()
    const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
    const hours = vietnamTime.getHours()
    const minutes = vietnamTime.getMinutes()

    const isBeforeStop =
      hours < dailyTimes.stopHour || (hours === dailyTimes.stopHour && minutes <= dailyTimes.stopMinute)

    const isAfterStart =
      hours > dailyTimes.startHour || (hours === dailyTimes.startHour && minutes >= dailyTimes.startMinute)

    if (isBeforeStop && isAfterStart) {
      await checkAndProcessPayments(pb)
    }
  } catch (error) {
    console.error('Failed to start cron job:', error)
  }
}

// Start the cron job
startCronJob()
