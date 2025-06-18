import React from "react";

const Navbar = () => {
  return (
    <nav className="bg-black text-white  flex justify-around items-center p-4 shadow-md h-16">
      <div className="logo font-bold md:text-2xl">
        <span className="text-purple-900">&lt; </span>
        Secure
        <span className="text-purple-900"> Vault </span>
        <span className="text-purple-900"> / &gt; </span>
      </div>
      <ul>
        <li className="flex gap-6 ">
          <a href="https://github.com/nihar8262/Secure-Vault" target="_blank" className="flex items-center md:gap-3 cursor-pointer border border-purple-600 shadow-inner shadow-purple-500 rounded-full p-1 px-2 md:px-4 hover:bg-purple-900 hover:text-white transition-all duration-300">
            <lord-icon
              src="https://cdn.lordicon.com/acgiczyg.json"
              trigger="hover"
              stroke="bold"
              colors="primary:#ffffff,secondary:#cb5eee"
              style={{ width: "40px", height: "40px" }}
            ></lord-icon>
            <p>Github</p>
          </a>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;
