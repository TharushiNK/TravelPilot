import axios from "axios"; 

export const getWeatherByCity = async (city) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    const response = await axios.get(
        "https://api.openweathermap.org/data/2.5/weather",
        {
            params: {
                q: `${city},LK`,
                appid: apiKey,
                units: "metric"
            }
        }
    );

    return response.data;
};

export const getForecastByCity = async (city) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    const response = await axios.get(
        "https://api.openweathermap.org/data/2.5/forecast",
        {
            params: {
                q: `${city},LK`,
                appid: apiKey,
                units: "metric"
            }
        }   
    );

    return response.data;
};
