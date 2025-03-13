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
    const response = await axios.post('http://localhost:5173/submit', {
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

// Main function to start the cron job
async function startCronJob() {
  try {
    // Authenticate with PocketBase
    const pb = await authenticatePB()

    // Schedule the cron job to run every 2 minutes
    cron.schedule('* * * * *', async () => {
      console.log('Running payment processing cron job...')
      await checkAndProcessPayments(pb)
    })

    console.log('Payment processing cron job started')

    // Optional: Run immediately on startup
    checkAndProcessPayments(pb)
  } catch (error) {
    console.error('Failed to start cron job:', error)
  }
}

// Start the cron job
startCronJob()
