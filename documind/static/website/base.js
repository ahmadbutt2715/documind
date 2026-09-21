const menuButton = document.getElementById("menuButton");
const mobileMenu = document.getElementById("mobileMenu");


// Open / close mobile menu

menuButton.addEventListener("click", () => {

    const isOpen = mobileMenu.classList.toggle("open");


    menuButton.classList.toggle(
        "open",
        isOpen
    );


    menuButton.setAttribute(
        "aria-expanded",
        isOpen
    );


    menuButton.setAttribute(
        "aria-label",
        isOpen
            ? "Close navigation menu"
            : "Open navigation menu"
    );

});



// Close menu after clicking a link

mobileMenu
    .querySelectorAll("a")
    .forEach(link => {

        link.addEventListener(
            "click",
            () => {

                mobileMenu.classList.remove(
                    "open"
                );

                menuButton.classList.remove(
                    "open"
                );

                menuButton.setAttribute(
                    "aria-expanded",
                    "false"
                );

                menuButton.setAttribute(
                    "aria-label",
                    "Open navigation menu"
                );

            }
        );

    });