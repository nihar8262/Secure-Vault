import React, { useEffect } from "react";
import { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import {v4 as uuidv4} from 'uuid';
import image from "../assets/sphere.png";


const Manager = () => {
  const [showPassword, setShowPasswordState] = useState(true);
  const [form, setForm] = useState({ site: "", username: "", password: "" });
  const [passwordArray, setPasswordArray] = useState([]);

  useEffect(() => {
    let passwords = localStorage.getItem("passwords");
    if (passwords) {
      setPasswordArray(JSON.parse(passwords));
    }
  }, []);

  const togglePassword = () => {
    setShowPasswordState(!showPassword);
  };

  const savePassword = () => {
    if(form.site.length >3 && form.username.length >3 && form.password.length >3) {

      setPasswordArray([...passwordArray, {...form, id: uuidv4()}]);
      localStorage.setItem("passwords", JSON.stringify([...passwordArray, {...form, id: uuidv4()}]));
      console.log("Password saved:", [...passwordArray, {...form, id: uuidv4()}]);
      setForm({ site: "", username: "", password: "" });
      toast("Password saved!", {
        position: "bottom-right",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: 500,
        theme: "dark",
      });
    }
    else{
      toast("Please fill all fields", {
        theme: "dark",
      });
    }
  };

  const deletePassword = (id) => {
    console.log("Delete password with id:", id);
    let c = confirm("Are you sure you want to delete this password?");
    if (c) {
      setPasswordArray(passwordArray.filter((item) => item.id !== id));
      localStorage.setItem("passwords", JSON.stringify(passwordArray.filter((item) => item.id !== id)));
    }  
    
  };

  const editPassword = (id) => {
    console.log("Edit password with id:", id);
    setForm(passwordArray.find((item) => item.id === id));
    setPasswordArray(passwordArray.filter((item) => item.id !== id));
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const copyText = (text) => () => {
    toast("Copy to clipboard", {
      position: "bottom-right",
      autoClose: 1000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "dark",
    });
    navigator.clipboard.writeText(text);
  };
  return (
    <>
      <ToastContainer
        position="bottom-right"
        autoClose={1000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnFocusLoss={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        transition="Bounce"
      />
      <div className="box spinning-bg">
       <div className="container relative mx-auto mt-10 mb-16 inset-shadow-sm rounded-2xl inset-shadow-purple-500 shadow shadow-purple-600  backdrop-blur-lg w-[98vw] md:max-w-5xl min-h-[68.5vh] 2xl:min-h-[72vh]">
        {/* <img src={image} className="bg-cover mix-blend-overlay bg-center"/> */}
        <div className="md:text-4xl text-2xl font-bold text-center pt-10 p-2 ">
          <span className="text-purple-800">&lt; </span>
          Secure{" "}
          <span>
            <lord-icon
              src="https://cdn.lordicon.com/mzcaikdp.json"
              trigger="in"
              delay="800"
              stroke="bold"
              state="in-reveal"
              colors="primary:#000000,secondary:#cb5eee"
              style={{ width: "45px", height: "45px", padding: "5px 0px" }}
            ></lord-icon>
          </span>
          <span className="text-purple-800"> Vault </span>
          <span className="text-purple-800"> / &gt; </span>
        </div>
        <p className="text-purple-700 text-center">Your Own Password Manager</p>
        <div className=" flex flex-col gap-4 p-4 ">
          <input
            placeholder="Enter your website URL"
            value={form.site}
            type="text"
            onChange={handleChange}
            name="site"
            id="site"
            className="border-purple-600 border shadow-inner shadow-purple-500 rounded-full p-4 py-1"
          />
          <div className="md:flex md:w-full md:justify-between md:gap-8">
            <input
              value={form.username}
              placeholder="Enter your username"
              type="text"
              onChange={handleChange}
              name="username"
              id="username"
              className="border-purple-600 border shadow-inner mb-4 shadow-purple-500 rounded-full w-full p-4 py-1"
            />
            <div className="relative w-full">
              <input
                value={form.password}
                placeholder="Enter password"
                type={showPassword ? "password" : "text"}
                onChange={handleChange}
                name="password"
                id="password"
                className="border-purple-600 border shadow-inner shadow-purple-500 rounded-full w-full  p-4 py-1"
              />
              <span
                className="absolute right-3 top-[1px] cursor-pointer"
                onClick={togglePassword}
              >
                {showPassword ? (
                  <lord-icon
                    src="https://cdn.lordicon.com/wepoiyzv.json"
                    trigger="hover"
                    stroke="bold"
                    colors="primary:#000000,secondary:#cb5eee"
                  ></lord-icon>
                ) : (
                  <lord-icon
                    src="https://cdn.lordicon.com/wepoiyzv.json"
                    trigger="hover"
                    stroke="bold"
                    state="hover-cross"
                    colors="primary:#000000,secondary:#cb5eee"
                  ></lord-icon>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={savePassword}
            className="flex items-center cursor-pointer w-fit font-semibold mx-auto gap-2 border border-purple-600 shadow-inner shadow-purple-500  rounded-full md:p-3 p-2 hover:bg-purple-800 hover:text-white  transition-all duration-300"
          >
            <lord-icon
              src="https://cdn.lordicon.com/mfdeeuho.json"
              trigger="hover"
              stroke="bold"
              colors="primary:#ffffff,secondary:#8930e8"
            ></lord-icon>
            Add Password
          </button>
        </div>

        <div className="passwords p-4">
          <h2 className="font-bold md:text-2xl py-4">Your Passwords</h2>
          {passwordArray.length === 0 && (
            <div className="text-center py-3">No passwords saved </div>
          )}
          {passwordArray.length !== 0 && (
            <table className="table-auto w-full rounded-lg shadow-lg shadow-purple-500/50 overflow-hidden">
              <thead className="bg-purple-600 text-white">
                <tr className="text-xs sm:text-sm md:text-lg">
                  <th className="py-2">Site</th>
                  <th className="py-2">Username</th>
                  <th className="py-2">Password</th>
                  <th> Actions</th>
                </tr>
              </thead>
              <tbody className="text-purple-800 bg-purple-400/20">
                {passwordArray.map((item, index) => (
                  <tr key={index} className="">
                    <td className=" border border-purple-300 py-2 text-center text-xs md:text-sm">
                      <div className="flex flex-col md:flex md:flex-row items-center justify-center gap-2 md:gap-6">
                        <a href={item.site} target="_blank">
                          {item.site}
                        </a>
                        <span
                          className="lordicon"
                          onClick={copyText(item.site)}
                        >
                          <lord-icon
                            src="https://cdn.lordicon.com/xuoapdes.json"
                            trigger="hover"
                            colors="primary:#8930e8"
                            style={{
                              width: "20px",
                              height: "20px",
                              padding: "5px 0px",
                              cursor: "pointer",
                            }}
                          ></lord-icon>
                        </span>
                      </div>
                    </td>
                    <td className="  border border-purple-300 py-2 text-center text-xs md:text-sm">
                      <div className="flex flex-col sm:flex md:flex-row items-center justify-center gap-2 md:gap-6">
                        <span>{item.username}</span>
                        <span
                          className="lordicon"
                          onClick={copyText(item.username)}
                        >
                          <lord-icon
                            src="https://cdn.lordicon.com/xuoapdes.json"
                            trigger="hover"
                            colors="primary:#8930e8"
                            style={{
                              width: "20px",
                              height: "20px",
                              padding: "5px 0px",
                              cursor: "pointer",
                            }}
                          ></lord-icon>
                        </span>
                      </div>
                    </td>
                    <td className="border border-purple-300 py-2 text-center text-xs md:text-sm">
                      <div className="flex flex-col sm:flex md:flex-row items-center justify-center gap-2 md:gap-6">
                        <span>{showPassword ? "*****" : item.password}</span>
                        <span
                          className="lordicon"
                          onClick={copyText(item.password)}
                        >
                          <lord-icon
                            src="https://cdn.lordicon.com/xuoapdes.json"
                            trigger="hover"
                            colors="primary:#8930e8"
                            style={{
                              width: "20px",
                              height: "20px",
                              padding: "5px 0px",
                              cursor: "pointer",
                            }}
                          ></lord-icon>
                        </span>
                      </div>
                    </td>
                    <td className="  border border-purple-300 py-2 text-center">
                      <div className="flex items-center justify-center gap-2 md:gap-6">
                        <span
                          onClick={()=> editPassword(item.id)}
                        >
                          <lord-icon
                            src="https://cdn.lordicon.com/iubtdgvu.json"
                            trigger="hover"
                            stroke="bold"
                            colors="primary:#242424,secondary:#8930e8"
                            style={{
                              width: "25px",
                              height: "25px",
                              cursor: "pointer",
                            }}
                          ></lord-icon>
                        </span>
                        <span
                          onClick={()=> deletePassword(item.id)}
                        >
                          <lord-icon
                            src="https://cdn.lordicon.com/tftntjtg.json"
                            trigger="hover"
                            stroke="bold"
                            colors="primary:#242424,secondary:#8930e8"
                            style={{
                              width: "25px",
                              height: "25px",
                              cursor: "pointer",
                            }}
                          ></lord-icon>
                        </span>
                        
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
       </div>
      </div>
    </>
  );
};

export default Manager;
