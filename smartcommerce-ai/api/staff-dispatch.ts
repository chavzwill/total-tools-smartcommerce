import {dispatchHandler} from '../src/server/couriers/dispatchRuntime.js';
export const config={api:{bodyParser:false}};
export default dispatchHandler(true);
