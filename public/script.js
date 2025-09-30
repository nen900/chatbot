

const mesage_container = document.getElementById("container_for_message");
const message_form = document.getElementById("sender-box");
const message_form_content = document.getElementById("message2send");
const bot_text = `Welcome to Karbz Dehpour, I am Fid the bot.
                   To let me know what you want to do today, please type and send;
                   1 to place an order,
                   99 to checkout order
                   98 to see order history
                   97 to see current order
                   0 to cancel order. `

const wrong_input = `It seems you selected an invalid option😕😕.
                   To let me know what you want to do today, please type and send;
                   1 to place an order,
                   99 to checkout order
                   98 to see order history
                   97 to see current order
                   0 to cancel order.`

const socket = io({
  transports: ["polling"]
});

let cur_stage = "main"

appendMessages("You started a conversation with Fid");
appendMessages(`fidBot said: ${bot_text}`);
appendMessages("fidBot said:\n Here's the menu:");
socket.emit("place_order", "menu");

//on puting live  in pipeos this bit isnt working so getting the menu as page loads now. 
const userName = prompt("hey, what's uour name?")
appendmessages(`fidBot said:\n Hello, ${userName}. ${bot_text}`)
socket.emit("new_user", userName)

//to show the messages in the chat
socket.on("send_chat_message", data => {
   appendmessages(` ${data.userName}: ${data.message}`)
});

// // to tell everybodt a user jouned
// socket.on("user_connected", userName => {
//    appendmessages(`${userName} joined the chat`)
// });

message_form.addEventListener("submit", e => {
    e.preventDefault()

    const message = message_form_content.value
    if (!message) 
        return

    socket.emit("send_chat_message", message)
    appendmessages(` You said:\n ${message}`)

    const userChoice = message_form_content.value.trim()
    switch (userChoice) {
        case "1":
            console.log(cur_stage)
            if (cur_stage === "main"){
              socket.emit("place_order", "menu");
              cur_stage = "ordering"
              console.log(cur_stage)
            } else if (cur_stage === "ordering") {
                socket.emit("place_order", "1")
            }
            break

        case "99":
            console.log(cur_stage)
            const userID = document.cookie.split("=")[1];

            // to backend to get Paystack checkout link
            socket.emit("get_cart_total", userID, (cartInfo) => {
                const { total, email } = cartInfo;

                if (total === 0) {
                    appendmessages("fidBot said:\n\n Your cart is empty, place an order and make FidBot HAPPY!");
                    return;
                }

                fetch("/pay", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: total, email, userID })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.url) {
                        appendmessages(`fidBot said:\n\n Please use this link to complete payment: ${data.url}`);
                    } else {
                        appendmessages("fidBot said:\n\n Sorry, i couldn't get payment link. \n Please try checking out again.");
                    }
                })
                .catch(err => {
                    console.error(err);
                    appendmessages("fidBot said:\n\n Payment request failed.");
                });
            });
        
            cur_stage = "main";
            console.log(cur_stage);
            break;

        case "98":
           socket.emit("view_past_orders")
           cur_stage = "main"
            break    

        case "97":
            socket.emit("view_cart");
            break  

        case "0":
            cur_stage = "main"
            socket.emit("cancel_order")
            appendmessages("Order cancelled ")
            break
        default:

            if ( cur_stage === "ordering" ){
             socket.emit("place_order", userChoice);
            } else {
                appendmessages(`fidBot said:\n\n ${wrong_input}`);
            }
            break 
    };

    message_form_content.value = ""
});

function appendmessages(message) {
    const messageElement = document.createElement("div")
    messageElement.innerText = message
    mesage_container.append(messageElement)
};

