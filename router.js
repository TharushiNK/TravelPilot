import express from 'express'
import { getUsers, signUpController, getHotelDetails,addHotelController, 
    showEditHotelForm, updateHotelController, getTourGuideDetails, addTourGuideController, 
    showEditTourGuideForm, getTransportDetails, addTransportController, updateTourGuideController, 
    showEditTransportForm,updateTransportController, getHotelDetailsById, getAllHotelsForTourist, 
    createBookingController, checkRoomAvailability, getHotelBookingsByHotelId, updateBookingStatus, 
    getAllGuidesForTourist, getGuideDetailsById, createGuideBookingController, createTransportBooking, 
    getTransportProviderById, getAllTransportProviders, getTransportBookingsByProviderId,updateTransportBookingStatus,
    getTourGuideBookingsByGuideId,updateTourGuideBookingStatus,
    getAllUserBookings,getUserBookingsByType,generateTravelSuggestions,shareItinerary,publishSummaryController,
    deleteTourSummary,publishItineraryController,getDestinations,getTourDetails,contactUsController,getAdminDashboard,getContactUsPage} from './controller.js'
import { login, logoutController } from './authController.js'
import { upload } from './config/multer.js'
import { getCurrentWeatherJSON, getForecast, getWeather } from './apiController.js'
import { aiController } from './services/aiService.js'
const router = express.Router()

//test route--http://localhost:3000/
router.get('/',(req,res)=>{
    res.render('firstpage');
})
//--http://localhost:3000/contactUs
router.get('/contactUs',(req,res)=>{
    res.render('contactUs');
})

//fetch all users--http://localhost:3000/users
router.get('/users',getUsers)

//handle login(render signup)--http://localhost:3000/login
router.get('/signup', (req, res) => {
    res.render('signup', {
        error: null,
        success: null
    });
});

// Render login page--http://localhost:3000/login
router.get('/login', (req, res) => {
    const successMessage = req.session.success
    req.session.success = null // clear after showing once

    res.render('login', {
        error: null,
        success: successMessage,
        email: ''
    })
})

// Handle login form submission --http://localhost:3000/login
router.post('/login', (req, res, next) => {
    // Pass to authController's login function
    login(req, res);
});

//------hotelier routes-----------

//fetch hotels for the logged-in hotelier --http://localhost:3000/hotelier
router.get('/hotelier', getHotelDetails)

// Render add hotel form --http://localhost:3000/hotelier/hotels/add
router.get('/hotelier/hotels/add', (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    res.render('addHotel', {
        user,
        isEdit: false,
        hotel: {}, 
        error: null,
        success: null
    });
});

//http://localhost:3000/hotelier/hotels/add
router.post(
    '/hotelier/hotels/add',
    upload.array('photos', 10),
    addHotelController
);

//EDIT HOTEL (load form) ---http://localhost:3000/hotelier/hotels/edit/1
router.get('/hotelier/hotels/edit/:id', showEditHotelForm);

//UPDATE HOTEL (PUT method)
router.put('/hotelier/hotels/:id',
    upload.array('photos', 10),
    updateHotelController
);

// GET all hotels for tourist listing --http://localhost:3000/hotels
router.get('/hotels', getAllHotelsForTourist);

//get hotel details by id
router.get("hotels/:id", getHotelDetailsById);

//--------handle hotel booking-----
//add new booking
router.post('/bookings', createBookingController);

//check room availability
router.get('/rooms/availability', checkRoomAvailability);

//get booking details by id
router.get('/hotelier/bookings/:hotelId', getHotelBookingsByHotelId);

//update booking status
router.put('/api/bookings/:bookingId/status', updateBookingStatus);

//--http://localhost:3000/api/weather?city=kandy ---http://localhost:3000/api/weather

router.get('/tourist', getWeather);                 
router.get('/api/weather/current', getCurrentWeatherJSON);
router.get('/api/weather/forecast', getForecast)

//------handling tour guide----------

//http://localhost:3000/tour-guide
router.get('/tour-guide', getTourGuideDetails);

//add tour guides details --http://localhost:3000/tour-guide/add
router.get('/tour-guide/add', (req, res) => {
    res.render('addTourGuide', {
        user: req.session.user,
        isEdit: false,
        guide: {},
        error: null,
        success: null
    });
});

//http://localhost:3000/tour-guide/add
router.post(
    '/tour-guide/add',
    upload.array('photos', 10),
    addTourGuideController
);

//edit tour guide details --http://localhost:3000/tour-guide/edit/1
router.get('/tour-guide/edit/:id', showEditTourGuideForm);

router.put(
    '/tour-guide/:id',
    upload.array('photos', 10),
    updateTourGuideController
);

// GET all guides -- http://localhost:3000/guides
router.get('/guides', getAllGuidesForTourist);

// GET guide details by ID -- http://localhost:3000/guides/:id
router.get('/guides/:id', getGuideDetailsById);

// POST new booking -- http://localhost:3000/guides/bookings
router.post('/guides/bookings', createGuideBookingController);

// Get tour guide bookings
router.get('/tour-guide/bookings/:guideId', getTourGuideBookingsByGuideId);

// Update tour guide booking status
router.put('/api/tour-guide-bookings/:bookingId/status', updateTourGuideBookingStatus);



// Transport provider routes

//http://localhost:3000/transport
router.get('/transport', getTransportDetails);

//add transport details --http://localhost:3000/transport/add
router.get('/transport/add', (req, res) => {
    res.render('addTransport', {
        user: req.session.user,
        isEdit: false,
        provider: {},
        error: null,
        success: null
    });
});

router.post(
    '/transport/add',
    upload.array('photos', 10),
    addTransportController
);

//http://localhost:3000/transport/edit/1
router.get('/transport/edit/:id', showEditTransportForm);

router.put(
    '/transport/:id',
    upload.array('photos', 10),
    updateTransportController
);

// Public routes - Get all transport providers
router.get('/transport-providers', getAllTransportProviders);

// Public route - Get transport provider by ID
router.get('/transport-providers/:id', getTransportProviderById);

// Protected route - Create booking (requires authentication)
router.post('/transport-bookings', createTransportBooking);

// Get transport provider bookings
router.get('/transport-provider/bookings/:providerId', getTransportBookingsByProviderId);

// Update transport booking status
router.put('/api/transport-bookings/:bookingId/status', updateTransportBookingStatus);

//-------tourist view all bookings-----------
router.get('/bookings/history', getAllUserBookings);

// Filtered bookings by type
router.get('/bookings/history/:type', getUserBookingsByType);

// Travel suggestions
router.get('/bookings/history/suggestions/generate', generateTravelSuggestions)

// Share itinerary
router.post('/bookings/share/:id', shareItinerary);

//-----handling ai----
router.post('/api/gemini/chat', aiController);

//handle logout
router.get('/logout', logoutController);

//-----------------------------------------------------------------------------

router.get('/contactUs', getContactUsPage);
router.get('/admin', getAdminDashboard)
router.post('/publish-itinerary', upload.array('dayImages', 15), publishItineraryController);
router.get('/destinations', getDestinations);
router.get('/tour/:id', getTourDetails);
router.get('/admin/delete-summary/:id', deleteTourSummary)
router.post('/publish-summary', upload.single('mainImage'), publishSummaryController);
router.post('/contactUs',contactUsController)

//-----------------------------------------------------------------------------

//handling invalid urls
router.get('/*any',(req,res)=>{
    res.send("Oops!! You'are trying to reach Invalid URL")
})

router.post('/users', signUpController)

export default router;
