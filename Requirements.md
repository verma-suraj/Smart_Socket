# Backend for the ESP32 S3 system 

## Hardware
- Pzem 004T v4
- ESP32 S3
- LCD screen
- DS18B20
- RFID RC522
- Single Channel relay module

## Objective
- To make web dashboard where we can push the telemetry of the esp32 directly over internet and later on using the can bus protocol 
- The dashboard should be made in such a way that it can handle multiple ESP32 devices . It should not be limited to any specific number of ESP32
- We have to achiece this without using any third party system like sinrc pro . Or hosting the websever on the esp locally . 
- We need to send turn on off command from the server and it should be able to actully turn specific gpio pin in the esp
- The dashboard should have specific port for each esp and if I want to add one more device on the dashboard it should be easy not a complex task than require to change the core code or the achitecture .
- The code should be modular so that it will be esay to debug as well as adding new features won't be a headache
- There should be a dedicated authenticaion system on the dashboard so that we can authorize user based on their given credentials but the credentials will be served through esp and if the authorization gets successful then the command to the esp will be sent for the access grant 
- The costumer id and the authorization part must be easy . So that we can add new customer or update their details easily . 
- For phase 1 we will be using the website as the admin panel as well as for the user dashboard . also the website will be the main decision maker for the turning on and off for the specific threshold
- We will use the MQTT protocol for the development of the phase 1 

## Details of the project 
- We are developing a smart socket using the hardware that I have mentioned above . 
- The main task of the smart socket it that it should measure the voltage , current and other factors and if any of the value goes above threshold it should do the specified task that is mentioned in the logic .
- It will be doing adaptive load management . 

## Threshold and logic
- For each module (1 unit of smart socket) we will be measuring three main things: voltage, current, and temp, and with these readings we will calculate the total active load on the socket (Power = V * I). 
- With the total load value we will calculate the total units consumed and also record the session time (one will be total session time per login and the other will be the continuous time for which the socket is on without being turned off). 
- **Safety Override:** The temperature threshold is strictly hardcoded to 40°C. If a socket exceeds this, the backend must immediately issue a turn-off command regardless of ALM priority.
- **ALM Loop:** The dashboard will feature a dynamic slider bar to set the Total Transformer Load Threshold for phase 1. The backend will continuously aggregate the load readings of all active sockets. If the total actual load exceeds the threshold, the backend will turn off the socket with the lowest priority. This loop repeats until the total load is safely below the threshold limit.


### Priority Logic
---
- We will ask the user to enter the initial soc when starting the charging. 
- Then we will do a little maths: How long the battery will take to charge till 100% (approximation), based on the info we have about the battery type and the charger details that the user mentioned during profile creation. 
- Then finally we will check which socket will require more time to charge the battery till full based on the current estimation. The socket that needs more time to charge the battery full will get the higher priority.
- **Partial Info Fallback:** The initial soc is optional data. If someone is not willing to tell the initial soc, the system will default the SOC to **20%** for calculations (a conservative estimate to ensure they maintain priority). If guest mode is used and specs are skipped entirely, the system assigns a static lowest-priority score.
- **Worst Case Scenario:** If we lack parameters to decide (e.g., missing data or a priority tie), we will be turning off the socket that is running for the longest continuous duration.

## Web dashboard user interface 
- For the first time user . we will ask for the name , ev type ( 2 wheeler , 4 wheeler) , brand , battery capacity , battery type , charger type and ratings . 
- Then the profile will be created and the user is now assigned a unique id also an rfid card will be issued . 
- When ever the user taps the rfid card on the smart socket . The uid will be sent for authorization and that socket will be assigned to the the user . 
- After login the dashboard should have options like charge ev or charge as guest .
- For guest mode we will ask for the ev specs again like the capacity , type and ratings . 
- The charge will start and the session time will be recorded . Also the unit consumed during the session . 
- Our dashborad should should show all the previous session data like time , ev ( owner or guest) , unit consumed .

## Requirements for phase 1 
- Make a slider bar that we can use to change the total load threshold dynamically and the calculation should be done base on that . 
- The temp threshold will be 40 degree celcius 

## Must follow 
- Don't use local host or hosting the server in the esp .
- The data of the esp must be available over internet from anywhere .
- The achitecture should be modular so that any future update will be easy to integrate . Like switching from wifi to can bus . 
- Can use services like firebase or something 
- Don't use thirdparty apps like sinric pro to turn on off the esp devices . 

## Phase 2 add-on 
- We will introcude a central mcu like raspberrry or something else to behave as a aggregator between the esp and the dashboard . also the mcu will be the main alm and all the computation will be done on that only and the dashboard will be used only for displaying the data. 
